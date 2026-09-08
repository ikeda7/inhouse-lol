import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardTitle, EmptyState, ErrorState, LoadingState } from '../components/ui';
import type { LeaderboardEntry } from '../types';

type SortKey = 'wins' | 'winRate' | 'avgKda' | 'points';

const SORT_LABELS: Record<SortKey, string> = {
  wins: 'Vitórias',
  winRate: 'Winrate',
  avgKda: 'KDA',
  points: 'Pontos',
};

/** Ouro, prata e bronze nos três primeiros; o resto só o número. */
const MEDAL = ['text-gold', 'text-slate-300', 'text-amber-700'];

/**
 * Ranking geral. +3 por mapa vencido, +1 de bônus por vencer a MD3.
 *
 * Duas apresentações do mesmo dado: tabela no desktop, cartão no celular.
 * A tabela tem 8 colunas -- no celular ela virava rolagem horizontal, que é
 * exatamente o que ninguém faz. No cartão, o que importa (posição, nome,
 * pontos) fica na primeira linha e o detalhe vai embaixo.
 */
export function DashboardPage() {
  const [sortBy, setSortBy] = useState<SortKey>('wins');
  const { data, loading, error, reload } = useAsync(
    () => statsApi.leaderboard(sortBy),
    [sortBy]
  );

  return (
    <div className="space-y-5">
      <Card
        padding={false}
        title={<CardTitle icon={Trophy}>Classificação geral</CardTitle>}
        action={
          <div
            className="flex gap-0.5 rounded-md bg-raised p-0.5"
            role="group"
            aria-label="Ordenar por"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                aria-pressed={sortBy === key}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                  sortBy === key
                    ? 'bg-overlay text-ink shadow-sm'
                    : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        }
      >
        {loading && <LoadingState />}
        {error && (
          <div className="p-4">
            <ErrorState error={error} onRetry={reload} />
          </div>
        )}
        {data && data.length === 0 && (
          <EmptyState label="Nenhuma partida registrada. Abra uma MD3 na Noite de jogos para começar." />
        )}

        {data && data.length > 0 && (
          <>
            {/* --- celular --- */}
            <ul className="divide-y divide-line/40 sm:hidden">
              {data.map((entry, index) => (
                <LinhaCelular key={entry.playerId} entry={entry} posicao={index} />
              ))}
            </ul>

            {/* --- desktop --- */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line/40 text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="py-2.5 pl-5 pr-2 font-medium">#</th>
                    <th className="py-2.5 pr-2 font-medium">Jogador</th>
                    <th className="py-2.5 pr-2 text-right font-medium">V–D</th>
                    <th className="py-2.5 pr-2 text-right font-medium">Jogos</th>
                    <th className="py-2.5 pr-2 text-right font-medium">Winrate</th>
                    <th className="py-2.5 pr-2 text-right font-medium">KDA</th>
                    <th className="py-2.5 pr-2 text-right font-medium" title="Dano por minuto">
                      DPM
                    </th>
                    <th className="py-2.5 pr-5 text-right font-medium" title="Visão média">
                      Visão
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/25">
                  {data.map((entry, index) => (
                    <tr key={entry.playerId} className="group transition hover:bg-raised/50">
                      <td className={`py-2.5 pl-5 pr-2 tabular text-xs ${MEDAL[index] ?? 'text-ink-faint'}`}>
                        {index + 1}
                      </td>
                      <td className="py-2.5 pr-2">
                        <Link
                          to={`/jogadores/${entry.playerId}`}
                          className="font-medium text-ink transition group-hover:text-gold"
                        >
                          {entry.name}
                        </Link>
                        {entry.wonLastSeries && (
                          <span
                            className="ml-1.5 text-[11px]"
                            title="Venceu a MD3 mais recente"
                          >
                            🏆
                          </span>
                        )}
                      </td>
                      <td className="tabular py-2.5 pr-2 text-right font-bold text-gold">
                        {entry.wins}–{entry.losses}
                      </td>
                      <td className="tabular py-2.5 pr-2 text-right text-ink-faint">
                        {entry.games}
                      </td>
                      <td
                        className={`tabular py-2.5 pr-2 text-right font-medium ${
                          entry.winRate >= 50 ? 'text-win' : 'text-loss'
                        }`}
                      >
                        {entry.winRate}%
                      </td>
                      <td className="tabular py-2.5 pr-2 text-right text-ink">
                        {entry.avgKda.toFixed(2)}
                      </td>
                      <td className="tabular py-2.5 pr-2 text-right text-ink-muted">
                        {entry.avgDamagePerMinute}
                      </td>
                      <td className="tabular py-2.5 pr-5 text-right text-ink-muted">
                        {entry.avgVisionScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {data && data.length > 0 && (
        <p className="px-1 text-center text-[11px] text-ink-faint">
          Empate se resolve por KDA, depois winrate, depois nº de jogos · 🏆 venceu a última MD3
        </p>
      )}
    </div>
  );
}

function LinhaCelular({ entry, posicao }: { entry: LeaderboardEntry; posicao: number }) {
  return (
    <li>
      <Link
        to={`/jogadores/${entry.playerId}`}
        className="flex items-center gap-3 px-4 py-3 transition active:bg-raised"
      >
        <span
          className={`tabular w-5 shrink-0 text-center text-sm font-bold ${MEDAL[posicao] ?? 'text-ink-faint'}`}
        >
          {posicao + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {entry.name}
            {entry.wonLastSeries && <span className="ml-1" title="Venceu a MD3 mais recente">🏆</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
            <span className="tabular">
              {entry.wins}–{entry.losses}
            </span>
            <span
              className={`tabular font-medium ${entry.winRate >= 50 ? 'text-win' : 'text-loss'}`}
            >
              {entry.winRate}%
            </span>
            <span className="tabular">KDA {entry.avgKda.toFixed(2)}</span>
          </p>
        </div>

        <span className="tabular shrink-0 text-lg font-bold text-gold">{entry.points}</span>
      </Link>
    </li>
  );
}
