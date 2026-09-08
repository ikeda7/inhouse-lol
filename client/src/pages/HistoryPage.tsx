import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ROLE_LABEL, type SeriesDetail } from '../types';

/** Historico de MD3 com placar agregado e detalhe expandivel de cada jogo. */
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
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gold-400">
          <History size={16} />
          Historico de series
        </h2>
      }
    >
      <ul className="divide-y divide-hextech-700/40">
        {data.map((series) => {
          const isOpen = expanded === series.id;
          return (
            <li key={series.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : series.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-gold-400"
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="flex-1 text-sm font-medium">
                  {series.name ?? new Date(series.date).toLocaleDateString('pt-BR')}
                </span>
                <span className="font-mono text-sm font-bold text-gold-400">
                  {series.scoreline}
                </span>
                <span
                  className={`w-24 text-right text-xs ${
                    series.status === 'ONGOING' ? 'text-amber-400' : 'text-gold-400/50'
                  }`}
                >
                  {series.status === 'ONGOING'
                    ? 'em andamento'
                    : series.winnerTeam === 'BLUE'
                      ? 'Azul venceu'
                      : series.winnerTeam === 'RED'
                        ? 'Vermelho venceu'
                        : 'sem vencedor'}
                </span>
              </button>

              {isOpen && <SeriesDetailPanel seriesId={series.id} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Carrega o detalhe sob demanda: a lista traz so o resumo, e puxar as
 * scoreboards de 30 series de uma vez seria desperdicio.
 */
function SeriesDetailPanel({ seriesId }: { seriesId: string }) {
  const { data, loading, error } = useAsync<SeriesDetail>(
    () => seriesApi.get(seriesId),
    [seriesId]
  );

  if (loading) return <LoadingState label="Carregando jogos..." />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4 pb-4 pl-7">
      {data.matches.map((match) => (
        <div
          key={match.id}
          className="rounded-lg border border-hextech-700/50 bg-hextech-800/30 p-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400/70">
            Jogo {match.matchNumber} ·{' '}
            {match.winner === 'BLUE' ? 'vitoria azul' : 'vitoria vermelha'}
            {match.gameDurationSec
              ? ` · ${Math.round(match.gameDurationSec / 60)} min`
              : ''}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {(['BLUE', 'RED'] as const).map((side) => (
              <div key={side}>
                <p
                  className={`mb-1 text-[11px] font-bold uppercase ${
                    side === 'BLUE' ? 'text-blueside' : 'text-redside'
                  }`}
                >
                  {side === 'BLUE' ? 'Azul' : 'Vermelho'}
                </p>
                <ul className="space-y-1 text-xs">
                  {match.stats
                    .filter((stat) => stat.teamSide === side)
                    .map((stat) => (
                      <li key={stat.id} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-gold-400/50">
                          {ROLE_LABEL[stat.rolePlayed]}
                        </span>
                        <span className="flex-1 truncate">{stat.player.name}</span>
                        <span className="truncate text-gold-400/60">
                          {stat.championName}
                        </span>
                        <span className="font-mono text-gold-300/80">
                          {stat.kills}/{stat.deaths}/{stat.assists}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.burnedChampions.length > 0 && (
        <p className="text-xs text-gold-400/50">
          Fearless: {data.burnedChampions.map((c) => c.championName).join(', ')}
        </p>
      )}
    </div>
  );
}
