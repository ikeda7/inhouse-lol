import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal } from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, EmptyState, ErrorState, LoadingState } from '../components/ui';

type SortKey = 'points' | 'winRate' | 'avgKda';

const SORT_LABELS: Record<SortKey, string> = {
  points: 'Pontos',
  winRate: 'Winrate',
  avgKda: 'KDA',
};

/** Leaderboard geral: +3 por mapa vencido, +1 de bonus por MD3 vencida. */
export function DashboardPage() {
  const [sortBy, setSortBy] = useState<SortKey>('points');
  const { data, loading, error, reload } = useAsync(
    () => statsApi.leaderboard(sortBy),
    [sortBy]
  );

  return (
    <Card
      title={
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gold-400">
          <Trophy size={16} />
          Classificacao geral
        </h2>
      }
      action={
        <div className="flex gap-1" role="group" aria-label="Ordenar por">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              aria-pressed={sortBy === key}
              className={`rounded px-2 py-1 text-xs font-semibold transition ${
                sortBy === key
                  ? 'bg-gold-400 text-hextech-950'
                  : 'text-gold-400/60 hover:text-gold-400'
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
      }
    >
      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState label="Nenhuma partida registrada ainda. Abra uma MD3 para comecar." />
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hextech-700/60 text-left text-[11px] uppercase tracking-wider text-gold-400/60">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">Jogador</th>
                <th className="py-2 pr-2 text-right font-medium">Pts</th>
                <th className="py-2 pr-2 text-right font-medium">V-D</th>
                <th className="py-2 pr-2 text-right font-medium">Winrate</th>
                <th className="py-2 pr-2 text-right font-medium">KDA</th>
                <th className="py-2 pr-2 text-right font-medium" title="Dano por minuto">
                  DPM
                </th>
                <th className="py-2 text-right font-medium" title="Placar de visao medio">
                  Visao
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hextech-700/30">
              {data.map((entry, index) => (
                <tr key={entry.playerId} className="hover:bg-hextech-800/40">
                  <td className="py-2 pr-2 text-gold-400/50">
                    {index < 3 ? (
                      <Medal
                        size={15}
                        className={
                          ['text-yellow-400', 'text-slate-300', 'text-amber-700'][index]
                        }
                        aria-label={`${index + 1}o lugar`}
                      />
                    ) : (
                      index + 1
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <Link
                      to={`/jogadores/${entry.playerId}`}
                      className="font-medium hover:text-gold-400 hover:underline"
                    >
                      {entry.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right font-bold text-gold-400">
                    {entry.points}
                  </td>
                  <td className="py-2 pr-2 text-right text-gold-300/70">
                    {entry.wins}-{entry.losses}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right font-medium ${
                      entry.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {entry.winRate}%
                  </td>
                  <td className="py-2 pr-2 text-right">{entry.avgKda.toFixed(2)}</td>
                  <td className="py-2 pr-2 text-right text-gold-300/70">
                    {entry.avgDamagePerMinute}
                  </td>
                  <td className="py-2 text-right text-gold-300/70">{entry.avgVisionScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
