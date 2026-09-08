import { useParams } from 'react-router-dom';
import { riotApi, playersApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, ErrorState, LoadingState, EmptyState } from '../components/ui';
import { ROLE_LABEL } from '../types';

/** Perfil: KDA, dano/min, winrate por role e o podio dos 3 campeoes mais jogados. */
export function PlayerProfilePage() {
  const { playerId = '' } = useParams();
  const profile = useAsync(() => playersApi.profile(playerId), [playerId]);
  const champions = useAsync(() => riotApi.champions().catch(() => null));

  if (profile.loading) return <LoadingState />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <EmptyState label="Jogador nao encontrado." />;

  const data = profile.data;
  const version = champions.data?.version;

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="text-2xl font-bold text-gold-400">{data.name}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Partidas" value={String(data.games)} />
          <Metric
            label="Winrate"
            value={`${data.winRate}%`}
            tone={data.winRate >= 50 ? 'good' : 'bad'}
          />
          <Metric label="KDA medio" value={data.avgKda.toFixed(2)} />
          <Metric label="Dano / min" value={String(data.avgDamagePerMinute)} />
        </div>
      </Card>

      <Card title="Top 3 campeoes">
        {data.championPodium.length === 0 ? (
          <EmptyState label="Sem partidas registradas." />
        ) : (
          <ol className="grid gap-3 sm:grid-cols-3">
            {data.championPodium.map((champion, index) => (
              <li
                key={champion.championName}
                className="flex flex-col items-center gap-2 rounded-lg border border-hextech-700/50 bg-hextech-800/40 p-4"
              >
                <span className="text-[11px] font-bold uppercase tracking-widest text-gold-400/60">
                  {index + 1}o
                </span>
                {champion.ddragonId && version ? (
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.ddragonId}.png`}
                    alt={champion.championName}
                    width={72}
                    height={72}
                    loading="lazy"
                    className="h-18 w-18 rounded-full border-2 border-gold-400/40"
                  />
                ) : (
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-hextech-700 bg-hextech-800 text-xs">
                    {champion.championName.slice(0, 8)}
                  </div>
                )}
                <p className="text-center text-sm font-semibold">{champion.championName}</p>
                <p className="text-xs text-gold-400/60">
                  {champion.games} jogo{champion.games === 1 ? '' : 's'} · {champion.winRate}% WR ·{' '}
                  {champion.avgKda.toFixed(2)} KDA
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Desempenho por role">
        <ul className="space-y-2">
          {data.byRole.map((role) => (
            <li key={role.role} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-gold-400/70">
                {ROLE_LABEL[role.role]}
              </span>
              {/* Barra proporcional ao winrate; o numero ao lado mantem a
                  informacao acessivel sem depender da largura da barra. */}
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-hextech-800">
                <div
                  className={`h-full rounded-full ${
                    role.winRate >= 50 ? 'bg-emerald-500/70' : 'bg-rose-500/70'
                  }`}
                  style={{ width: `${role.games > 0 ? role.winRate : 0}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs text-gold-400/60">
                {role.games === 0
                  ? 'sem jogos'
                  : `${role.wins}/${role.games} · ${role.winRate}%`}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-gold-300';
  return (
    <div className="rounded-lg border border-hextech-700/50 bg-hextech-800/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-gold-400/60">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
