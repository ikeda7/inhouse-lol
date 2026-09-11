import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Coins,
  Crosshair,
  Eye,
  Flame,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Timer,
  TrendingUp,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardTitle, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon } from '../components/ChampionIcon';
import { nomeDaSequencia } from '../lib/lolTerms';
import { harmonizarNoite } from '../lib/momentos';
import { useChampions } from '../hooks/useChampions';
import { ExportarImagem } from '../components/ExportarImagem';
import { resolvedorDeIcone } from '../lib/imagem/canvas';
import { gerarImagemDosRecordes } from '../lib/imagem/destaques';
import { gerarImagemDosMomentos, momentosDaUltimaNoite } from '../lib/imagem/momentos';
import { ROLE_LABEL, type MomentEntry, type MomentType, type RecordEntry } from '../types';

/**
 * Destaques (ideia do Vinim, issue #14).
 *
 * Duas leituras do mesmo dado, com pesos diferentes de propósito:
 *
 *   RECORDES é a parte que o grupo vai discutir no zap, então ganha o espaço
 *   nobre. Todo recorde aponta para UMA partida -- a graça é poder dizer em que
 *   jogo aconteceu.
 *
 *   MOMENTOS é linha do tempo, agrupada por noite. Cada cartão usa a palavra
 *   que o próprio jogo grita ("LEGENDARY", "QUADRA KILL") em vez de descrever
 *   o número: "10 seguidos" é descrição, "LEGENDARY" é reconhecimento imediato.
 */

const CATEGORIA: Record<string, { label: string; icon: LucideIcon; tom?: 'zoeira' }> = {
  kills: { label: 'Mais abates', icon: Swords },
  kda: { label: 'Melhor KDA', icon: TrendingUp },
  damage: { label: 'Mais dano', icon: Flame },
  dpm: { label: 'Maior DPM', icon: Zap },
  spree: { label: 'Maior sequência', icon: Crosshair },
  assists: { label: 'Mais assistências', icon: Sparkles },
  cs: { label: 'Mais farm', icon: Wheat },
  gold: { label: 'Mais ouro', icon: Coins },
  damageTaken: { label: 'Mais dano sofrido', icon: Shield },
  vision: { label: 'Mais visão', icon: Eye },
  cc: { label: 'Mais controle', icon: Timer },
  deaths: { label: 'Mais mortes', icon: Skull, tom: 'zoeira' },
};

export function HighlightsPage() {
  const { data, loading, error, reload } = useAsync(() => statsApi.highlights());
  const { manifest } = useChampions();
  /** O que os Momentos mostram (e a imagem leva): tudo, a última noite ou um jogo dela. */
  const [escopo, setEscopo] = useState<'todas' | 'noite' | number>('todas');

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  if (data.partidas === 0) {
    return (
      <EmptyState label="Nenhuma partida registrada ainda. Os destaques aparecem quando a primeira MD3 entrar." />
    );
  }

  // O seletor do card manda na TELA e na IMAGEM ao mesmo tempo -- antes ele só
  // mudava a imagem, e trocar de "Jogo 1" para "Jogo 2" parecia não fazer nada.
  //   Tudo         -> a tela mostra todas as noites; a imagem, a última noite
  //   Última noite -> as duas mostram a última noite, por jogo
  //   Jogo N       -> as duas mostram só aquele jogo da última noite
  const ultimaNoite = momentosDaUltimaNoite(data.momentos);
  const jogosDaNoite = [...new Set(ultimaNoite.map((m) => m.matchNumber))].sort((a, b) => a - b);
  const escopos: ('todas' | 'noite' | number)[] = ['todas', 'noite', ...jogosDaNoite];
  const jogoEscolhido = typeof escopo === 'number' ? escopo : null;
  const momentosDaImagem =
    jogoEscolhido === null
      ? ultimaNoite
      : ultimaNoite.filter((m) => m.matchNumber === jogoEscolhido);
  const momentosNaTela = escopo === 'todas' ? data.momentos : momentosDaImagem;
  const rotuloDoEscopo = (opcao: 'todas' | 'noite' | number) =>
    opcao === 'todas' ? 'Tudo' : opcao === 'noite' ? 'Última noite' : `Jogo ${opcao}`;

  return (
    <div className="space-y-6">
      <Card
        padding={false}
        title={<CardTitle icon={Award}>Recordes</CardTitle>}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-ink-faint">
              de {data.partidas} partida{data.partidas === 1 ? '' : 's'}
            </span>
            {/* A imagem usa os MESMOS textos da tela (rótulo, "LEGENDARY", a
                frase): se a tela mudar, a imagem muda junto. */}
            <ExportarImagem
              gerar={() =>
                gerarImagemDosRecordes(data, {
                  iconeDoCampeao: resolvedorDeIcone(manifest),
                  categoria: (chave) => {
                    const meta = CATEGORIA[chave];
                    return meta ? { label: meta.label, zoeira: meta.tom === 'zoeira' } : null;
                  },
                })
              }
              nomeDoArquivo={`inhouse-lol-recordes-${new Date().toISOString().slice(0, 10)}.png`}
              titulo="Recordes · InHouse LoL"
              vazio={data.recordes.length === 0}
            />
          </div>
        }
      >
        {data.recordes.length === 0 ? (
          <div className="p-4">
            <EmptyState label="Sem recordes por enquanto." />
          </div>
        ) : (
          // 12 categorias: fecha exatamente em 2, 3 ou 4 colunas, sem cartão
          // órfão numa última linha pela metade.
          <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.recordes.map((recorde) => (
              <CartaoDeRecorde key={recorde.categoria} recorde={recorde} />
            ))}
          </div>
        )}
      </Card>

      <Card
        padding={false}
        title={<CardTitle icon={Flame}>Momentos</CardTitle>}
        action={
          ultimaNoite.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div
                role="group"
                aria-label="Quais momentos mostrar"
                className="flex flex-wrap items-center gap-0.5 rounded-md border border-line/60 bg-raised p-0.5"
              >
                {escopos.map((opcao) => (
                  <button
                    key={String(opcao)}
                    type="button"
                    onClick={() => setEscopo(opcao)}
                    aria-pressed={escopo === opcao}
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                      escopo === opcao ? 'bg-gold/15 text-gold' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {rotuloDoEscopo(opcao)}
                  </button>
                ))}
              </div>
              {/* Diz o que a imagem leva: com "Tudo" a tela mostra todas as
                  noites, mas a imagem é só da última -- imagem de várias noites
                  não caberia num balão de conversa. */}
              <span className="text-[11px] text-ink-faint">
                Imagem: {ultimaNoite[0].seriesName ?? 'última noite'}
                {jogoEscolhido !== null ? ` · Jogo ${jogoEscolhido}` : ''}
              </span>
              <ExportarImagem
                gerar={() =>
                  gerarImagemDosMomentos(momentosDaImagem, {
                    iconeDoCampeao: resolvedorDeIcone(manifest),
                    momento: textoDoMomento,
                    jogo: jogoEscolhido ?? undefined,
                  })
                }
                nomeDoArquivo={`inhouse-lol-momentos-${ultimaNoite[0].playedAt.slice(0, 10)}${
                  jogoEscolhido !== null ? `-jogo-${jogoEscolhido}` : ''
                }.png`}
                titulo={`Momentos · ${ultimaNoite[0].seriesName ?? 'InHouse LoL'}`}
                vazio={momentosDaImagem.length === 0}
              />
            </div>
          )
        }
      >
        {data.momentos.length === 0 ? (
          <div className="p-4">
            <EmptyState label="Nenhum momento registrado ainda." />
            <p className="mt-2 text-center text-[11px] text-ink-faint">
              Partidas importadas antes desta tela não trazem esse dado. Rode o agente com{' '}
              <code className="rounded bg-overlay px-1 py-px">--refresh-all</code> para preencher.
            </p>
          </div>
        ) : (
          <LinhaDoTempo momentos={momentosNaTela} />
        )}
      </Card>
    </div>
  );
}

/** Onde o feito aconteceu: "Domingo 07/09 · Jogo 2". */
function ondeFoi(entry: { seriesName: string | null; playedAt: string; matchNumber: number }) {
  const quando = entry.seriesName ?? new Date(entry.playedAt).toLocaleDateString('pt-BR');
  return `${quando} · Jogo ${entry.matchNumber}`;
}

function CartaoDeRecorde({ recorde }: { recorde: RecordEntry }) {
  const meta = CATEGORIA[recorde.categoria];
  if (!meta) return null;

  const Icone = meta.icon;
  const zoeira = meta.tom === 'zoeira';

  return (
    <Link
      to={`/jogadores/${recorde.playerId}`}
      // A faixa esquerda é o lado em que o recorde foi feito: os times trocam
      // de lado na MD3, então a cor é a daquele jogo.
      className={`group flex items-center gap-3 rounded-lg border border-l-[3px] border-line/40 bg-raised/40 p-3 transition hover:bg-raised ${
        recorde.teamSide === 'BLUE' ? 'border-l-blue' : 'border-l-red'
      }`}
    >
      <span className="sr-only">{recorde.teamSide === 'BLUE' ? 'Time azul' : 'Time vermelho'}</span>
      <ChampionIcon championName={recorde.championName} size={44} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          <Icone size={12} />
          {meta.label}
        </p>
        <p className="truncate text-[15px] font-semibold text-ink transition group-hover:text-gold">
          {recorde.playerName}
        </p>
        <p className="truncate text-[11px] text-ink-faint">
          {ROLE_LABEL[recorde.rolePlayed]} · {ondeFoi(recorde)}
        </p>
      </div>

      {/* O número é o assunto do cartão. "Mais mortes" sai do ouro: virar
          troféu de morte confundiria o que é mérito. */}
      <span
        className={`tabular shrink-0 text-2xl font-bold leading-none ${
          zoeira ? 'text-loss' : 'text-gold'
        }`}
      >
        {recorde.exibicao}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Momentos
// ---------------------------------------------------------------------------

/**
 * Como cada tipo de momento se apresenta.
 *
 * `titulo` recebe o valor porque vários dependem dele -- a sequência vira
 * LEGENDARY ou RAMPAGE conforme o tamanho, não um rótulo fixo.
 *
 * `frase` é o que dá personalidade: sem ela o cartão é um número com nome do
 * lado, e a linha do tempo inteira lê igual.
 */
const MOMENTO: Record<
  MomentType,
  {
    titulo: (valor: number) => string;
    frase: (m: MomentEntry) => string;
    classe: string;
    /** Só o topo da raridade ganha anel -- se tudo brilha, nada brilha. */
    destaque?: boolean;
  }
> = {
  PENTA: {
    titulo: () => 'PENTAKILL',
    frase: (m) => `derrubou o time inteiro de ${m.championName}`,
    classe: 'bg-gold/20 text-gold ring-1 ring-gold/50',
    destaque: true,
  },
  QUADRA: {
    titulo: () => 'QUADRA KILL',
    frase: (m) => `quatro de uma vez, de ${m.championName}`,
    classe: 'bg-gold/15 text-gold ring-1 ring-gold/30',
    destaque: true,
  },
  SPREE: {
    titulo: (v) => nomeDaSequencia(v),
    frase: (m) => `${m.valor} abates sem morrer uma vez`,
    classe: 'bg-warn/15 text-warn',
  },
  SEM_MORRER: {
    titulo: () => 'SEM MORRER',
    frase: (m) => `fechou o jogo em ${m.kills}/${m.deaths}/${m.assists}`,
    classe: 'bg-win/15 text-win',
  },
  CARRY: {
    titulo: () => 'CARREGOU',
    frase: (m) =>
      `maior dano da partida: ${Math.round(m.valor / 1000)}k` + (m.win ? '' : ' — e ainda perdeu'),
    classe: 'bg-red/15 text-red',
  },
  MURALHA: {
    titulo: () => 'MURALHA',
    frase: (m) => `segurou ${Math.round(m.valor / 1000)}k de dano na frente`,
    classe: 'bg-blue/15 text-blue',
  },
  VISAO: {
    titulo: () => 'OLHO NO MAPA',
    frase: (m) => `${m.valor} pontos de visão, o maior do jogo`,
    classe: 'bg-overlay text-ink-muted',
  },
  FARM: {
    titulo: () => 'FAZENDEIRO',
    frase: (m) => `${m.valor} de farm por minuto`,
    classe: 'bg-overlay text-ink-muted',
  },
  FIRST_BLOOD: {
    titulo: () => 'FIRST BLOOD',
    frase: () => 'abriu o placar da partida',
    classe: 'bg-overlay text-ink-faint',
  },
};

/**
 * O texto de um momento como a tela escreve -- e é o mesmo que as imagens
 * escrevem, para as duas nunca dizerem coisas diferentes.
 */
function textoDoMomento(momento: MomentEntry) {
  const meta = MOMENTO[momento.tipo];
  return {
    titulo: meta.titulo(momento.valor),
    frase: meta.frase(momento),
    destaque: meta.destaque ?? false,
  };
}

/**
 * Linha do tempo agrupada por noite.
 *
 * Sem o agrupamento a lista vira uma sequência de cartões sem respiro, e a
 * pergunta que ela responde ("o que rolou na quinta?") fica difícil de ler.
 */
function LinhaDoTempo({ momentos }: { momentos: MomentEntry[] }) {
  const noites: { chave: string; titulo: string; itens: MomentEntry[] }[] = [];

  for (const momento of momentos) {
    const chave = momento.seriesId;
    const atual = noites.find((noite) => noite.chave === chave);
    if (atual) atual.itens.push(momento);
    else {
      noites.push({
        chave,
        titulo: momento.seriesName ?? new Date(momento.playedAt).toLocaleDateString('pt-BR'),
        itens: [momento],
      });
    }
  }

  // Cada noite fecha a grade sem cartão órfão -- as regras do corte estão em
  // lib/momentos.
  const harmonizadas = noites.map((noite) => ({ ...noite, ...harmonizarNoite(noite.itens) }));

  return (
    <div className="space-y-5 p-3">
      {harmonizadas.map((noite) => (
        <section key={noite.chave}>
          {/* A noite ("Domingo 07/09") é o que organiza o feed inteiro, e
              estava em 11px no token mais fraco -- menor e mais apagada que os
              cartões que ela agrupa, ou seja, hierarquia ao contrário. Passa a
              nome de verdade; a CONTAGEM é que fica em segundo plano. */}
          <h3 className="mb-2.5 flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink">
            {noite.titulo}
            <span className="h-px flex-1 bg-line/40" />
            <span className="text-[11px] font-normal uppercase tracking-widest text-ink-faint">
              {noite.itens.length} momento{noite.itens.length === 1 ? '' : 's'}
            </span>
          </h3>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {noite.itens.map((momento, index) => (
              <CartaoDeMomento
                key={`${momento.matchId}-${momento.playerId}-${momento.tipo}-${index}`}
                momento={momento}
                largo={noite.primeiroLargoNoTablet && index === 0}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** `largo`: ocupa as 2 colunas do tablet, para uma noite de 9 ou 15 fechar a linha. */
function CartaoDeMomento({ momento, largo = false }: { momento: MomentEntry; largo?: boolean }) {
  const meta = MOMENTO[momento.tipo];
  if (!meta) return null;

  return (
    <Link
      to={`/jogadores/${momento.playerId}`}
      className={`group flex items-center gap-3 rounded-lg border border-l-[3px] p-3 transition hover:bg-raised ${
        largo ? 'sm:col-span-2 xl:col-span-1' : ''
      } ${meta.destaque ? 'border-gold/30 bg-gold/[0.04]' : 'border-line/40 bg-raised/40'} ${
        // Faixa do lado em que o jogador estava naquele jogo.
        momento.teamSide === 'BLUE' ? 'border-l-blue' : 'border-l-red'
      }`}
    >
      <span className="sr-only">{momento.teamSide === 'BLUE' ? 'Time azul' : 'Time vermelho'}</span>
      <ChampionIcon championName={momento.championName} size={46} />

      <div className="min-w-0 flex-1">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${meta.classe}`}
        >
          {meta.titulo(momento.valor)}
        </span>
        <p className="mt-1 truncate text-[15px] font-semibold text-ink transition group-hover:text-gold">
          {momento.playerName}
        </p>
        <p className="truncate text-[11px] text-ink-faint">{meta.frase(momento)}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="tabular text-sm font-semibold text-ink-muted">
          {momento.kills}/{momento.deaths}/{momento.assists}
        </p>
        <p className={`text-[10px] font-bold uppercase ${momento.win ? 'text-win' : 'text-loss'}`}>
          {momento.win ? 'vitória' : 'derrota'}
        </p>
        <p className="text-[10px] text-ink-faint">Jogo {momento.matchNumber}</p>
      </div>
    </Link>
  );
}
