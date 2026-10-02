import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, History, Trash2, TriangleAlert } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChampions } from '../hooks/useChampions';
import { ExportarImagem } from '../components/ExportarImagem';
import { resolvedorDeIcone } from '../lib/imagem/canvas';
import { gerarImagemDaPartida } from '../lib/imagem/partida';
import { gerarImagemDaSerie } from '../lib/imagem/serie';
import { useAction, useAsync } from '../hooks/useAsync';
import { Card, CardTitle, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon, ordenarPorLane } from '../components/ChampionIcon';
import { Highlights } from '../components/Highlights';
import { conquistasEmOrdem, selosDaPartida, type SeloConquistado } from '../lib/selos';
import { NaSerie } from '../components/NaSerie';
import { MatchBans, MatchObjectives } from '../components/MatchObjectives';
import { calcularMaximos, MatchPlayerDetail } from '../components/MatchPlayerDetail';
import {
  ROLE_LABEL,
  type MatchStat,
  type SeriesDetail,
  type SeriesListItem,
  type SeriesSummary,
  type TeamSide,
} from '../types';

/**
 * Histórico de MD3.
 *
 * Três níveis de detalhe, cada um atrás de um clique, porque a tela inteira
 * aberta de uma vez seriam ~40 blocos de números:
 *
 *   série  ->  placar e vencedor
 *   jogo   ->  scoreboard dos dois times, objetivos e bans
 *   jogador -> build, quebra de dano, farm, visão, abates
 *
 * O nível do jogador existe para não dependermos do cliente do LoL aberto: tudo
 * que a tela de fim de partida mostrava está gravado e consultável aqui.
 */
export function HistoryPage() {
  const { data, loading, error, reload } = useAsync(() => seriesApi.list(30));
  const { podeAdministrar } = useAuth();

  // A série aberta e o jogo em foco moram no ENDEREÇO (?serie=&jogo=), não em
  // estado: é o que deixa o perfil, os recordes e os momentos mandarem a pessoa
  // direto ao jogo, e o link de uma noite ser colável no zap.
  const [consulta, setConsulta] = useSearchParams();
  const expanded = consulta.get('serie');
  const jogoEmFoco = Number(consulta.get('jogo')) || null;

  const alternar = (seriesId: string) => {
    // `replace`: abrir e fechar séries não pode encher o "voltar" do navegador.
    setConsulta(expanded === seriesId ? {} : { serie: seriesId }, { replace: true });
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || data.length === 0) {
    return <EmptyState label="Nenhuma MD3 registrada ainda." />;
  }

  return (
    <Card destaque title={<CardTitle icon={History}>Histórico de séries</CardTitle>}>
      <ul className="divide-y divide-line/40">
        {data.map((series) => {
          const isOpen = expanded === series.id;
          const vazia = series.matches.length === 0;
          return (
            <li key={series.id}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => alternar(series.id)}
                  aria-expanded={isOpen}
                  className="group min-w-0 flex-1 py-3.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="shrink-0 text-ink-faint transition group-hover:text-gold">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    {/* Cor explícita de propósito: esta linha é o nome da noite, o
                    item mais importante da tela, e ela ficava INVISÍVEL porque
                    `text-base` pintava com a cor de fundo (ver index.css). Se
                    depender de herança, um acidente desses volta calado. */}
                    <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ink transition group-hover:text-gold">
                      {series.name ?? new Date(series.date).toLocaleDateString('pt-BR')}
                    </span>
                    {/* "encerrada" saiu: era o estado de quase todas as linhas, e
                      rótulo que se repete em todas não informa. Só a exceção fala. */}
                    {series.status === 'ONGOING' && (
                      <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">
                        em andamento
                      </span>
                    )}
                    {/* Tinta, não dourado: numa lista em que toda linha tem placar, dourado
                    em todas deixa de apontar qualquer coisa (direção "Placar"). */}
                    <span className="tabular shrink-0 text-lg font-bold text-ink">
                      {series.scoreline}
                    </span>
                  </span>

                  <ResumoDaSerie series={series} />
                </button>

                {/* Só aparece em série sem NENHUM jogo, que por definição é
                    acidente -- um clique a mais em "Abrir nova MD3". O servidor
                    recusa qualquer outra, então a ausência do botão aqui é
                    conveniência, não a garantia. */}
                {vazia && podeAdministrar && (
                  <DescartarSerie series={series} onDescartada={reload} />
                )}
              </div>

              {isOpen && <SeriesDetailPanel seriesId={series.id} jogoEmFoco={jogoEmFoco} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * A linha de baixo de cada série na lista: quem jogou contra quem.
 *
 * "Quinta 01/10 · 2-0" sozinho não dizia de quem era o 2: para saber quem
 * ganhou a noite era preciso abrir a série. Os dois elencos vêm na ordem do
 * placar (time A, depois time B) e o vencedor leva a tinta e o selo -- os
 * times não têm nome nem cor fixa, então o que identifica um time é a gente.
 */
function ResumoDaSerie({ series }: { series: SeriesListItem }) {
  const { a, b } = series.elencos;
  if (a.length === 0 && b.length === 0) {
    return <span className="mt-1 block pl-7 text-xs text-ink-faint">Nenhum jogo registrado.</span>;
  }

  const vencedor =
    series.blueScore === series.redScore ? null : series.blueScore > series.redScore ? 'A' : 'B';
  const minutos = Math.round(
    series.matches.reduce((soma, match) => soma + (match.gameDurationSec ?? 0), 0) / 60
  );
  const jogos = series.matches.length;

  return (
    <span className="mt-1.5 block space-y-1 pl-7">
      {(['A', 'B'] as const).map((time) => {
        const venceu = vencedor === time;
        const elenco = time === 'A' ? a : b;
        return (
          <span key={time} className="flex min-w-0 items-baseline gap-2 text-[13px]">
            <span
              className={`tabular w-3 shrink-0 text-[11px] font-bold ${
                venceu ? 'text-ink' : 'text-ink-faint'
              }`}
            >
              {time}
            </span>
            <span className={`min-w-0 truncate ${venceu ? 'text-ink' : 'text-ink-muted'}`}>
              {elenco.map((jogador) => jogador.name).join(' · ')}
            </span>
            {venceu && (
              <span className="shrink-0 rounded bg-win/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-win">
                venceu
              </span>
            )}
          </span>
        );
      })}
      <span className="block text-[11px] text-ink-faint">
        {jogos} jogo{jogos === 1 ? '' : 's'}
        {minutos > 0 && ` · ${minutos} min de jogo`}
        {series.fearless && ' · Fearless'}
      </span>
    </span>
  );
}

/**
 * Descarta uma série que nunca teve jogo.
 *
 * Pede confirmação porque é a única ação do app que APAGA registro, e o nome
 * da noite entra na pergunta -- "tem certeza?" sozinho não deixa ninguém
 * conferir se está prestes a sumir com a linha errada.
 *
 * Não desfaz nada além disso: uma série com partida é recusada pelo servidor,
 * e o erro aparece aqui em vez de sumir no console.
 */
function DescartarSerie({
  series,
  onDescartada,
}: {
  series: SeriesSummary;
  onDescartada: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const descartar = useAction(seriesApi.discard);

  const rotulo = series.name ?? new Date(series.date).toLocaleDateString('pt-BR');

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        title={`Descartar "${rotulo}" -- essa série não tem nenhum jogo`}
        aria-label={`Descartar a série ${rotulo}`}
        className="shrink-0 rounded p-1.5 text-ink-faint transition hover:bg-loss/10 hover:text-loss"
      >
        <Trash2 size={15} />
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] text-ink-muted">Descartar {rotulo}?</span>
      <button
        onClick={async () => {
          if (await descartar.run(series.id)) onDescartada();
        }}
        disabled={descartar.loading}
        className="rounded bg-loss/15 px-2 py-1 text-[11px] font-semibold text-loss transition hover:bg-loss/25 disabled:opacity-60"
      >
        {descartar.loading ? 'descartando...' : 'sim'}
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="rounded px-2 py-1 text-[11px] font-semibold text-ink-muted transition hover:text-ink"
      >
        não
      </button>
      {descartar.error && (
        <span className="text-[11px] text-loss" role="alert">
          {descartar.error.message}
        </span>
      )}
    </span>
  );
}

/**
 * Carrega o detalhe sob demanda: a lista traz só o resumo, e puxar as
 * scoreboards de 30 séries de uma vez seria desperdício.
 */
function SeriesDetailPanel({
  seriesId,
  jogoEmFoco,
}: {
  seriesId: string;
  jogoEmFoco: number | null;
}) {
  const { data, loading, error } = useAsync<SeriesDetail>(
    () => seriesApi.get(seriesId),
    [seriesId]
  );
  const { manifest } = useChampions();
  const painel = useRef<HTMLDivElement>(null);

  // Quem chegou por um link (perfil, recorde, momento) cai numa lista de
  // séries com a certa aberta lá embaixo: rola até o jogo pedido, ou até o
  // começo da série. Só quando os dados chegam -- antes disso não há o que
  // mostrar -- e uma vez por série/jogo, para não brigar com a rolagem de
  // quem já está lendo.
  const carregou = data !== null && data !== undefined;
  useEffect(() => {
    if (!carregou) return;
    const alvo =
      (jogoEmFoco && painel.current?.querySelector(`[data-jogo="${jogoEmFoco}"]`)) ||
      painel.current;
    // `?.()`: nem todo ambiente tem scrollIntoView (o jsdom dos testes não tem).
    alvo?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [carregou, jogoEmFoco, seriesId]);

  if (loading) return <LoadingState label="Carregando jogos..." />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const serie = data;
  return (
    <div ref={painel} className="scroll-mt-20 space-y-4 pb-4 sm:pl-7">
      {serie.matches.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-ink-faint">Imagem da série</span>
          <ExportarImagem
            gerar={() => gerarImagemDaSerie(serie, { iconeDoCampeao: resolvedorDeIcone(manifest) })}
            nomeDoArquivo={`inhouse-lol-serie-${serie.date.slice(0, 10)}.png`}
            titulo={`${serie.name ?? 'MD3'} · InHouse LoL`}
          />
        </div>
      )}

      <NaSerie serie={serie} />

      {serie.matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          nomeDaSerie={serie.name}
          emFoco={match.matchNumber === jogoEmFoco}
        />
      ))}

      {data.burnedChampions.length > 0 && (
        <p className="text-xs text-ink-faint">
          Fearless: {data.burnedChampions.map((c) => c.championName).join(', ')}
        </p>
      )}
    </div>
  );
}

type Match = SeriesDetail['matches'][number];

function MatchCard({
  match,
  nomeDaSerie,
  emFoco,
}: {
  match: Match;
  nomeDaSerie: string | null;
  /** O jogo que um link pediu: ganha o fio dourado para o olho achar na série. */
  emFoco: boolean;
}) {
  // Um jogador aberto por vez na partida. Dois painéis abertos juntos empurram
  // o time de baixo para fora da tela e a comparação, que é o ponto, se perde.
  const [aberto, setAberto] = useState<string | null>(null);
  // No celular o jogo abre RECOLHIDO: uma MD3 de três jogos eram mais de 4 mil
  // pixels de rolagem para chegar no terceiro, e quem abre a série quer primeiro
  // ver quais jogos existem e quem ganhou cada um. O jogo que um link pediu já
  // vem aberto. No desktop a tela comporta os dois times lado a lado e tudo
  // continua aberto, como sempre foi.
  const [recolhido, setRecolhido] = useState(() => !emFoco && telaEstreita());
  // Um link pode pedir este jogo com a série já na tela (do perfil para cá).
  useEffect(() => {
    if (emFoco) setRecolhido(false);
  }, [emFoco]);

  const { manifest } = useChampions();
  // Selo compara os dez da partida, então sai daqui, onde os dez estão.
  const selos = selosDaPartida(match.stats);
  const maximos = calcularMaximos(match.stats);
  const statAberto = match.stats.find((stat) => stat.id === aberto) ?? null;

  return (
    <div
      data-jogo={match.matchNumber}
      // scroll-mt: o cabeçalho é fixo, e sem a folga o título do jogo parava
      // escondido atrás dele.
      className={`scroll-mt-20 rounded-lg border bg-raised/30 p-3 sm:p-4 ${
        emFoco ? 'border-gold/60' : 'border-line/50'
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-faint ${
          recolhido ? '' : 'mb-3'
        }`}
      >
        {/* Subtítulo do bloco, não rótulo miúdo: é o que separa um jogo do outro
            numa MD3 aberta. O botão fica DENTRO do título (o padrão de
            sanfona), para o leitor de tela anunciar "Jogo 1, recolhido". */}
        <h3 className="font-display text-base font-bold tracking-[-0.01em] text-ink">
          <button
            type="button"
            onClick={() => setRecolhido(!recolhido)}
            aria-expanded={!recolhido}
            className="-my-1.5 flex items-center gap-1 py-1.5 hover:text-gold"
          >
            {recolhido ? (
              <ChevronRight size={15} aria-hidden="true" className="text-ink-faint" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" className="text-ink-faint" />
            )}
            Jogo {match.matchNumber}
          </button>
        </h3>
        {match.gameDurationSec && (
          <span className="tabular">{Math.round(match.gameDurationSec / 60)} min</span>
        )}
        {match.gameVersion && (
          <span title="Patch em que a partida foi jogada">
            patch {match.gameVersion.split('.').slice(0, 2).join('.')}
          </span>
        )}
        {/* Rendição encerra o jogo antes da hora: os por-minuto ficam inflados e
            comparar com um jogo completo engana. A tela avisa em vez de
            apresentar números incomparáveis como se fossem equivalentes. */}
        {match.surrendered && (
          <span
            className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400"
            title="O jogo terminou em rendição -- as médias por minuto ficam mais altas do que num jogo completo."
          >
            <TriangleAlert size={11} />
            rendição
          </span>
        )}
        {recolhido ? (
          <PlacarDoJogo match={match} />
        ) : (
          <div className="ml-auto">
            <ExportarImagem
              gerar={() =>
                gerarImagemDaPartida(match, {
                  nomeDaSerie,
                  iconeDoCampeao: resolvedorDeIcone(manifest),
                })
              }
              nomeDoArquivo={`inhouse-lol-jogo-${match.matchNumber}-${match.playedAt.slice(0, 10)}.png`}
              titulo={`Jogo ${match.matchNumber} · InHouse LoL`}
            />
          </div>
        )}
      </div>

      {!recolhido && corpoDoJogo()}
    </div>
  );

  // Função comum, chamada, e NÃO um componente (<CorpoDoJogo />): declarado
  // aqui dentro, um componente teria identidade nova a cada render e o React
  // desmontaria os times e o painel do jogador a cada clique. Fica interna
  // porque usa meia dúzia de valores deste escopo (selos, máximos, o jogador
  // aberto).
  function corpoDoJogo() {
    return (
      <>
        {/* `items-start` protege contra time desfalcado (4 contra 5): sem isso o
          grid estica a coluna menor e a faixa verde do vencedor fica com um
          rabo de vazio embaixo. */}
        <div className="grid items-start gap-3 md:grid-cols-2">
          {(['BLUE', 'RED'] as const).map((side) => (
            <TeamColumn
              key={side}
              side={side}
              match={match}
              selos={selos}
              aberto={aberto}
              onToggle={(id) => setAberto(aberto === id ? null : id)}
            />
          ))}
        </div>

        <SelosDoJogo match={match} selos={selos} />

        {/* O detalhe do jogador vive AQUI, fora das colunas: em largura cheia ele
          usa as quatro faixas de estatística sem espremer as barras, e abrir um
          jogador não mexe mais na altura de nenhum dos dois times. */}
        {statAberto && (
          <div className="mt-3">
            <MatchPlayerDetail
              stat={statAberto}
              gameDurationSec={match.gameDurationSec}
              maximos={maximos}
            />
          </div>
        )}

        {/* Aqui é o contrário das colunas de time: os dois blocos SE ESTICAM para
          a mesma altura. Objetivos rende até 6 linhas e bans rende 2, e o
          `items-start` que estava aqui deixava meio painel de buraco ao lado de
          um card cheio.

          3fr/2fr e não meio a meio: objetivos rende até 6 linhas de placar e
          usa a largura; bans rende uma fileira de 5 retratos com teto de
          tamanho, e em metade de uma tela larga ela sobrava 130px de margem de
          cada lado. Estreitando essa coluna a fileira volta a preencher o card,
          e o painel de objetivos ganha o espaço que ele tem o que fazer. */}
        {(match.teams?.length ?? 0) > 0 && (
          <div className="mt-3 grid gap-3 md:grid-cols-[3fr_2fr]">
            <MatchObjectives teams={match.teams} />
            <MatchBans bans={match.bans ?? []} />
          </div>
        )}
      </>
    );
  }
}

/** Celular: abaixo do `md` do Tailwind. Sem `matchMedia` (testes), vale "larga". */
function telaEstreita(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 767px)').matches
  );
}

/**
 * O que um jogo recolhido diz de si: abates de cada lado e quem venceu. É o
 * placar que a galera lembra ("28 a 19"), e basta para escolher qual abrir.
 */
function PlacarDoJogo({ match }: { match: Match }) {
  const abates = (lado: TeamSide) =>
    match.stats.filter((stat) => stat.teamSide === lado).reduce((soma, s) => soma + s.kills, 0);
  if (match.stats.length === 0) return null;

  const venceu = match.winner === 'BLUE' ? 'azul' : match.winner === 'RED' ? 'vermelho' : null;

  return (
    <span className="ml-auto flex items-center gap-2 text-[13px]">
      <span className="tabular font-semibold">
        <span className="text-blue">{abates('BLUE')}</span>
        <span className="mx-1 font-normal text-ink-faint">x</span>
        <span className="text-red">{abates('RED')}</span>
      </span>
      {venceu && (
        <span className={`font-semibold ${match.winner === 'BLUE' ? 'text-blue' : 'text-red'}`}>
          {venceu} venceu
        </span>
      )}
    </span>
  );
}

/**
 * A faixa "selos do jogo": quem levou cada selo, com o número.
 *
 * No celular não existe hover, então o emoji sozinho na linha do jogador seria
 * um enigma. Aqui ele ganha nome e dono, e vira a legenda da partida.
 */
function SelosDoJogo({ match, selos }: { match: Match; selos: Map<string, SeloConquistado[]> }) {
  const conquistas = conquistasEmOrdem(selos, match.stats);
  if (conquistas.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Selos do jogo">
      {conquistas.map(({ selo, valor, nome, playerId }) => {
        // O ponto colorido diz de que time é o dono do selo -- azul ou vermelho
        // NESTE jogo, como a coluna em que ele aparece.
        const lado = match.stats.find((stat) => stat.playerId === playerId)?.teamSide;
        const nomeDoLado = lado === 'BLUE' ? 'Time azul' : 'Time vermelho';
        return (
          <li
            key={selo.id}
            title={`${nomeDoLado} · ${selo.descrever(valor)}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
              selo.zoeira ? 'border-loss/30 bg-loss/10' : 'border-line/60 bg-raised/60'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${lado === 'BLUE' ? 'bg-blue' : 'bg-red'}`}
            />
            <span className="sr-only">{nomeDoLado}:</span>
            <span aria-hidden="true">{selo.emoji}</span>
            <span className={`font-semibold ${selo.zoeira ? 'text-loss' : 'text-ink'}`}>
              {selo.nome}
            </span>
            <span className="text-ink-muted">{nome}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TeamColumn({
  side,
  match,
  selos,
  aberto,
  onToggle,
}: {
  side: TeamSide;
  match: Match;
  selos: Map<string, SeloConquistado[]>;
  aberto: string | null;
  onToggle: (id: string) => void;
}) {
  const doLado = ordenarPorLane(match.stats.filter((stat) => stat.teamSide === side));

  return (
    <div
      // Quem perdeu não fica apagado: a `opacity-80` que estava aqui derrubava
      // o nome do time para 4.2:1 e as roles para 3.9:1, ambos abaixo de AA --
      // medido pela verificação de telas no CI. O vencedor já se distingue
      // pela faixa verde, pelo anel e pelo selo VENCEU; o perdedor só não
      // ganha nada disso.
      //
      // `min-w-0`: item de grid tem largura mínima = o conteúdo. Sem isto, no
      // celular o nome longo não encolhia (o `truncate` nunca disparava) e a
      // linha empurrava o K/D/A para fora do card (#84) -- os emojis dos selos
      // pioraram o que já vazava.
      className={`min-w-0 rounded-lg p-2 transition ${
        match.winner === side ? 'bg-win/[0.06] ring-1 ring-win/25' : ''
      }`}
    >
      <p
        className={`mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase ${
          side === 'BLUE' ? 'text-blue' : 'text-red'
        }`}
      >
        {side === 'BLUE' ? 'Azul' : 'Vermelho'}
        {match.winner === side && (
          <span className="rounded bg-win/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-win">
            VENCEU
          </span>
        )}
      </p>

      <ul className="space-y-1 text-sm">
        {doLado.map((stat) => (
          <li key={stat.id}>
            <PlayerRow
              stat={stat}
              selos={selos.get(stat.playerId) ?? []}
              expandido={aberto === stat.id}
              onToggle={() => onToggle(stat.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Os selos da partida na linha: só o emoji. Nome e número vão no título e na faixa de baixo. */
function SelosDoJogador({ selos }: { selos: SeloConquistado[] }) {
  if (selos.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-[13px] leading-none">
      {selos.map(({ selo, valor }) => (
        <span key={selo.id} title={`${selo.nome}: ${selo.descrever(valor)}`}>
          <span className="sr-only">{`${selo.nome}: ${selo.descrever(valor)}`}</span>
          <span aria-hidden="true">{selo.emoji}</span>
        </span>
      ))}
    </span>
  );
}

function PlayerRow({
  stat,
  selos,
  expandido,
  onToggle,
}: {
  stat: MatchStat;
  selos: SeloConquistado[];
  expandido: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={expandido}
      className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition hover:bg-raised/60 ${
        expandido ? 'bg-raised/60' : ''
      }`}
    >
      <ChampionIcon championName={stat.championName} size={32} />
      {/* A role some quando a coluna do time é estreita -- no celular e entre
          768 e 1023px, onde os dois times dividem a tela. As linhas já vêm na
          ordem das lanes, com o campeão do lado: ali o rótulo custava 66px que
          eram do nome ("Deny…"). */}
      <span className="hidden w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-ink-faint sm:block md:hidden lg:block">
        {ROLE_LABEL[stat.rolePlayed]}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{stat.player.name}</span>
      <SelosDoJogador selos={selos} />
      <Highlights stat={stat} />
      <span className="tabular shrink-0 text-[15px] font-semibold text-ink-muted">
        {stat.kills}/{stat.deaths}/{stat.assists}
      </span>
      {/* A seta é o único indício de que a linha abre. Sem ela ninguém descobre
          que existe um nível a mais de detalhe atrás do clique. */}
      <ChevronRight
        size={14}
        className={`shrink-0 text-ink-faint transition-transform ${expandido ? 'rotate-90' : ''}`}
      />
    </button>
  );
}
