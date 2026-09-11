import { useState } from 'react';
import { ChevronDown, ChevronRight, History, Trash2, TriangleAlert } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useChampions } from '../hooks/useChampions';
import { ExportarImagem } from '../components/ExportarImagem';
import { resolvedorDeIcone } from '../lib/imagem/canvas';
import { gerarImagemDaPartida } from '../lib/imagem/partida';
import { gerarImagemDaSerie } from '../lib/imagem/serie';
import { useAction, useAsync } from '../hooks/useAsync';
import { Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon, ordenarPorLane } from '../components/ChampionIcon';
import { Highlights } from '../components/Highlights';
import { conquistasEmOrdem, selosDaPartida, type SeloConquistado } from '../lib/selos';
import { MatchBans, MatchObjectives } from '../components/MatchObjectives';
import { calcularMaximos, MatchPlayerDetail } from '../components/MatchPlayerDetail';
import {
  ROLE_LABEL,
  type MatchStat,
  type SeriesDetail,
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
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || data.length === 0) {
    return <EmptyState label="Nenhuma MD3 registrada ainda." />;
  }

  return (
    <Card
      title={
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
          <History size={16} />
          Histórico de séries
        </h2>
      }
    >
      <ul className="divide-y divide-line/40">
        {data.map((series) => {
          const isOpen = expanded === series.id;
          const vazia = series.matches.length === 0;
          return (
            <li key={series.id}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpanded(isOpen ? null : series.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3.5 text-left hover:text-gold"
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {/* Cor explícita de propósito: esta linha é o nome da noite, o
                    item mais importante da tela, e ela ficava INVISÍVEL porque
                    `text-base` pintava com a cor de fundo (ver index.css). Se
                    depender de herança, um acidente desses volta calado. */}
                  <span className="flex-1 text-[17px] font-semibold text-ink">
                    {series.name ?? new Date(series.date).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="tabular text-lg font-bold text-gold">{series.scoreline}</span>
                  <span
                    className={`w-28 text-right text-[13px] ${
                      series.status === 'ONGOING' ? 'text-amber-400' : 'text-ink-faint'
                    }`}
                  >
                    {series.status === 'ONGOING' ? 'em andamento' : 'encerrada'}
                  </span>
                </button>

                {/* Só aparece em série sem NENHUM jogo, que por definição é
                    acidente -- um clique a mais em "Abrir nova MD3". O servidor
                    recusa qualquer outra, então a ausência do botão aqui é
                    conveniência, não a garantia. */}
                {vazia && <DescartarSerie series={series} onDescartada={reload} />}
              </div>

              {isOpen && <SeriesDetailPanel seriesId={series.id} />}
            </li>
          );
        })}
      </ul>
    </Card>
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
function SeriesDetailPanel({ seriesId }: { seriesId: string }) {
  const { data, loading, error } = useAsync<SeriesDetail>(
    () => seriesApi.get(seriesId),
    [seriesId]
  );
  const { manifest } = useChampions();

  if (loading) return <LoadingState label="Carregando jogos..." />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const serie = data;
  return (
    <div className="space-y-4 pb-4 sm:pl-7">
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

      {serie.matches.map((match) => (
        <MatchCard key={match.id} match={match} nomeDaSerie={serie.name} />
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

function MatchCard({ match, nomeDaSerie }: { match: Match; nomeDaSerie: string | null }) {
  // Um jogador aberto por vez na partida. Dois painéis abertos juntos empurram
  // o time de baixo para fora da tela e a comparação, que é o ponto, se perde.
  const [aberto, setAberto] = useState<string | null>(null);
  const { manifest } = useChampions();
  // Selo compara os dez da partida, então sai daqui, onde os dez estão.
  const selos = selosDaPartida(match.stats);
  const maximos = calcularMaximos(match.stats);
  const statAberto = match.stats.find((stat) => stat.id === aberto) ?? null;

  return (
    <div className="rounded-lg border border-line/50 bg-raised/30 p-3 sm:p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
        <span>Jogo {match.matchNumber}</span>
        {match.gameDurationSec && (
          <span className="tabular font-normal normal-case tracking-normal">
            {Math.round(match.gameDurationSec / 60)} min
          </span>
        )}
        {match.gameVersion && (
          <span
            className="font-normal normal-case tracking-normal"
            title="Patch em que a partida foi jogada"
          >
            patch {match.gameVersion.split('.').slice(0, 2).join('.')}
          </span>
        )}
        {/* Rendição encerra o jogo antes da hora: os por-minuto ficam inflados e
            comparar com um jogo completo engana. A tela avisa em vez de
            apresentar números incomparáveis como se fossem equivalentes. */}
        {match.surrendered && (
          <span
            className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-normal normal-case tracking-normal text-amber-400"
            title="O jogo terminou em rendição -- as médias por minuto ficam mais altas do que num jogo completo."
          >
            <TriangleAlert size={11} />
            rendição
          </span>
        )}
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
      </div>

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
    </div>
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
      {conquistas.map(({ selo, valor, nome }) => (
        <li
          key={selo.id}
          title={selo.descrever(valor)}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
            selo.zoeira ? 'border-loss/30 bg-loss/10' : 'border-line/60 bg-raised/60'
          }`}
        >
          <span aria-hidden="true">{selo.emoji}</span>
          <span className={`font-semibold ${selo.zoeira ? 'text-loss' : 'text-ink'}`}>
            {selo.nome}
          </span>
          <span className="text-ink-muted">{nome}</span>
        </li>
      ))}
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
      className={`rounded-lg p-2 transition ${
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
      <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
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
