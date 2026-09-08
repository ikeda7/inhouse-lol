import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ChampionIcon, ordenarPorLane } from '../components/ChampionIcon';
import { Highlights } from '../components/Highlights';
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
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
          <History size={16} />
          Historico de series
        </h2>
      }
    >
      <ul className="divide-y divide-line/40">
        {data.map((series) => {
          const isOpen = expanded === series.id;
          return (
            <li key={series.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : series.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-gold"
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="flex-1 text-sm font-medium">
                  {series.name ?? new Date(series.date).toLocaleDateString('pt-BR')}
                </span>
                <span className="font-mono text-sm font-bold text-gold">
                  {series.scoreline}
                </span>
                <span
                  className={`w-24 text-right text-xs ${
                    series.status === 'ONGOING' ? 'text-amber-400' : 'text-ink-faint'
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
          className="rounded-lg border border-line/50 bg-raised/30 p-3"
        >
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
            <span>Jogo {match.matchNumber}</span>
            {match.gameDurationSec && (
              <span className="tabular font-normal normal-case tracking-normal">
                {Math.round(match.gameDurationSec / 60)} min
              </span>
            )}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {(['BLUE', 'RED'] as const).map((side) => (
              <div
                key={side}
                className={`rounded-lg p-2 transition ${
                  match.winner === side
                    ? 'bg-win/[0.06] ring-1 ring-win/25'
                    : 'opacity-70'
                }`}
              >
                <p
                  className={`mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase ${
                    side === 'BLUE' ? 'text-blue' : 'text-red'
                  }`}
                >
                  {side === 'BLUE' ? 'Azul' : 'Vermelho'}
                  {/* Vitória marcada no time, não numa frase separada: o olho
                      acha o vencedor na hora, sem ler. */}
                  {match.winner === side && (
                    <span className="rounded bg-win/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-win">
                      VENCEU
                    </span>
                  )}
                </p>
                {/* Ordem da Fenda: Top em cima, Support embaixo -- como em
                    transmissão de campeonato. Sem isso a ordem vem do banco e
                    embaralha a cada partida. */}
                <ul className="space-y-0.5 text-xs">
                  {ordenarPorLane(match.stats.filter((stat) => stat.teamSide === side)).map(
                    (stat) => (
                      <li
                        key={stat.id}
                        className="flex items-center gap-2 rounded px-1 py-1 transition hover:bg-raised/50"
                      >
                        <ChampionIcon championName={stat.championName} size={22} />
                        <span className="w-11 shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                          {ROLE_LABEL[stat.rolePlayed]}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {stat.player.name}
                        </span>
                        <Highlights stat={stat} />
                        <span className="tabular shrink-0 text-ink-muted">
                          {stat.kills}/{stat.deaths}/{stat.assists}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.burnedChampions.length > 0 && (
        <p className="text-xs text-ink-faint">
          Fearless: {data.burnedChampions.map((c) => c.championName).join(', ')}
        </p>
      )}
    </div>
  );
}
