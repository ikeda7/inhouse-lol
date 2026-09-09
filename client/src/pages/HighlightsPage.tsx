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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  if (data.partidas === 0) {
    return (
      <EmptyState label="Nenhuma partida registrada ainda. Os destaques aparecem quando a primeira MD3 entrar." />
    );
  }

  return (
    <div className="space-y-6">
      <Card
        padding={false}
        title={<CardTitle icon={Award}>Recordes</CardTitle>}
        action={
          <span className="text-[11px] text-ink-faint">
            de {data.partidas} partida{data.partidas === 1 ? '' : 's'}
          </span>
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

      <Card padding={false} title={<CardTitle icon={Flame}>Momentos</CardTitle>}>
        {data.momentos.length === 0 ? (
          <div className="p-4">
            <EmptyState label="Nenhum momento registrado ainda." />
            <p className="mt-2 text-center text-[11px] text-ink-faint">
              Partidas importadas antes desta tela não trazem esse dado. Rode o agente com{' '}
              <code className="rounded bg-overlay px-1 py-px">--refresh-all</code> para preencher.
            </p>
          </div>
        ) : (
          <LinhaDoTempo momentos={data.momentos} />
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
      className="group flex items-center gap-3 rounded-lg border border-line/40 bg-raised/40 p-3 transition hover:border-line hover:bg-raised"
    >
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

  return (
    <div className="space-y-5 p-3">
      {noites.map((noite) => (
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CartaoDeMomento({ momento }: { momento: MomentEntry }) {
  const meta = MOMENTO[momento.tipo];
  if (!meta) return null;

  return (
    <Link
      to={`/jogadores/${momento.playerId}`}
      className={`group flex items-center gap-3 rounded-lg border p-3 transition hover:bg-raised ${
        meta.destaque
          ? 'border-gold/30 bg-gold/[0.04]'
          : 'border-line/40 bg-raised/40 hover:border-line'
      }`}
    >
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
        <p
          className={`text-[10px] font-bold uppercase ${momento.win ? 'text-win' : 'text-loss'}`}
        >
          {momento.win ? 'vitória' : 'derrota'}
        </p>
        <p className="text-[10px] text-ink-faint">Jogo {momento.matchNumber}</p>
      </div>
    </Link>
  );
}
