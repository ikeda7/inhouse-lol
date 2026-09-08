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
  TrendingUp,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardTitle, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon } from '../components/ChampionIcon';
import { ROLE_LABEL, type MomentEntry, type RecordEntry } from '../types';

/**
 * Destaques (ideia do Vinim, issue #14).
 *
 * Duas leituras do mesmo dado, com pesos diferentes de propósito:
 *
 *   RECORDES é a parte que o grupo vai discutir no zap, então ganha o espaço
 *   nobre: número grande, cartão inteiro, campeão junto. Todo recorde aponta
 *   para UMA partida -- a graça é poder dizer em que jogo aconteceu.
 *
 *   MOMENTOS é linha do tempo: quadra, penta e sequência longa em ordem, do
 *   mais recente pro mais antigo. Lista densa, porque aqui o valor está no
 *   acúmulo, não em cada linha.
 */

/**
 * Rótulo e ícone de cada recorde.
 *
 * A ordem daqui é a ordem na tela, e ela não é alfabética: abates, KDA e dano
 * são o que se comenta primeiro; farm, ouro e visão são detalhe; morte fecha,
 * porque é piada e não mérito.
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
    <div className="space-y-5">
      <Card padding={false} title={<CardTitle icon={Award}>Recordes</CardTitle>}>
        {data.recordes.length === 0 ? (
          <div className="p-4">
            <EmptyState label="Sem recordes por enquanto." />
          </div>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recordes.map((recorde) => (
              <CartaoDeRecorde key={recorde.categoria} recorde={recorde} />
            ))}
          </div>
        )}
      </Card>

      <Card padding={false} title={<CardTitle icon={Flame}>Momentos</CardTitle>}>
        {data.momentos.length === 0 ? (
          <div className="p-4">
            <EmptyState label="Nenhuma quadra, penta ou sequência longa registrada ainda." />
            {/* As partidas importadas antes desta tela existir entraram sem esse
                dado -- a coluna fica em zero até reimportar. Sem esta linha, a
                tela vazia mentiria dizendo que ninguém pentou. */}
            <p className="mt-2 text-center text-[11px] text-ink-faint">
              Partidas importadas antes desta tela não trazem esse dado. Rode o agente com{' '}
              <code className="rounded bg-overlay px-1 py-px">--refresh</code> para preencher.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line/30">
            {data.momentos.map((momento, index) => (
              <LinhaDeMomento key={`${momento.matchId}-${momento.playerId}-${index}`} momento={momento} />
            ))}
          </ul>
        )}
      </Card>

      <p className="px-1 text-center text-[11px] text-ink-faint">
        Baseado em {data.partidas} partida{data.partidas === 1 ? '' : 's'} registrada
        {data.partidas === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** Onde o feito aconteceu: "Domingo 07/09 · Jogo 2". */
function ondeFoi(entry: { seriesName: string | null; playedAt: string; matchNumber: number }) {
  const quando =
    entry.seriesName ?? new Date(entry.playedAt).toLocaleDateString('pt-BR');
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
      <ChampionIcon championName={recorde.championName} size={38} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          <Icone size={11} />
          {meta.label}
        </p>
        <p className="truncate text-sm font-semibold text-ink transition group-hover:text-gold">
          {recorde.playerName}
        </p>
        <p className="truncate text-[10px] text-ink-faint">
          {ROLE_LABEL[recorde.rolePlayed]} · {ondeFoi(recorde)}
        </p>
      </div>

      {/* O número é o assunto do cartão, então é ele que recebe o peso.
          "Mais mortes" sai do ouro: virar troféu de morte confundiria. */}
      <span
        className={`tabular shrink-0 text-xl font-bold leading-none ${
          zoeira ? 'text-loss' : 'text-gold'
        }`}
      >
        {recorde.exibicao}
      </span>
    </Link>
  );
}

const TIPO_DO_MOMENTO: Record<MomentEntry['tipo'], { rotulo: string; classe: string }> = {
  PENTA: { rotulo: 'PENTAKILL', classe: 'bg-gold/20 text-gold ring-1 ring-gold/40' },
  QUADRA: { rotulo: 'QUADRA', classe: 'bg-gold/10 text-gold' },
  SPREE: { rotulo: 'SEQUÊNCIA', classe: 'bg-overlay text-ink-muted' },
};

function LinhaDeMomento({ momento }: { momento: MomentEntry }) {
  const tipo = TIPO_DO_MOMENTO[momento.tipo];

  return (
    <li>
      <Link
        to={`/jogadores/${momento.playerId}`}
        className="group flex items-center gap-2.5 px-3 py-2.5 transition hover:bg-raised/50"
      >
        <ChampionIcon championName={momento.championName} size={26} />

        <span
          className={`tabular shrink-0 rounded px-1.5 py-px text-[9px] font-bold tracking-wide ${tipo.classe}`}
        >
          {momento.tipo === 'SPREE' ? `${momento.valor} SEGUIDOS` : tipo.rotulo}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink transition group-hover:text-gold">
            {momento.playerName}
          </p>
          <p className="truncate text-[10px] text-ink-faint">{ondeFoi(momento)}</p>
        </div>

        <span className="tabular shrink-0 text-xs text-ink-muted">
          {momento.kills}/{momento.deaths}/{momento.assists}
        </span>
        <span
          className={`shrink-0 text-[10px] font-semibold ${
            momento.win ? 'text-win' : 'text-loss'
          }`}
        >
          {momento.win ? 'V' : 'D'}
        </span>
      </Link>
    </li>
  );
}
