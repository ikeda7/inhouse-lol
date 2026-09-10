import { Link, useParams } from 'react-router-dom';
import { Crown, History, Swords } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Avatar, Card, CardTitle, ErrorState, LoadingState, EmptyState } from '../components/ui';
import { ChampionIcon } from '../components/ChampionIcon';
import { Highlights } from '../components/Highlights';
import { ROLE_LABEL, type PlayerProfile, type RecentMatch } from '../types';

/**
 * Perfil do jogador.
 *
 * Era três cartões empilhados numa coluna estreita, com muito vazio dos lados
 * numa tela grande. Agora divide em duas colunas a partir de `lg`: à esquerda a
 * identidade (números gerais, campeões, roles), à direita o histórico pessoal.
 *
 * A lista de partidas é o que faltava. Média responde "como ele joga"; a lista
 * responde "como ele VEM jogando", que é a pergunta que se faz ao abrir o
 * perfil de alguém depois de uma noite.
 */
export function PlayerProfilePage() {
  const { playerId = '' } = useParams();
  const { data, loading, error, reload } = useAsync(
    () => playersApi.profile(playerId),
    [playerId]
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState label="Jogador não encontrado." />;

  return (
    <div className="space-y-5">
      <Cabecalho data={data} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Campeoes data={data} />
          <PorRole data={data} />
        </div>

        <UltimasPartidas partidas={data.recentMatches} />
      </div>
    </div>
  );
}

function Cabecalho({ data }: { data: PlayerProfile }) {
  const kda = `${data.totalKills} / ${data.totalDeaths} / ${data.totalAssists}`;

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* Esta é A tela sobre uma pessoa, e era a única lista do app onde ela
              não tinha rosto. `lg` porque aqui a foto é o assunto, não um
              marcador ao lado de um nome numa linha de tabela. */}
          <Avatar photoUrl={data.photoUrl} name={data.name} size="lg" />

          <div>
          <h1 className="text-3xl font-bold text-gold">{data.name}</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {data.games} partida{data.games === 1 ? '' : 's'} registrada
            {data.games === 1 ? '' : 's'}
            {data.seriesWon > 0 && (
              <>
                {' · '}
                <span className="text-ink-muted">
                  {data.seriesWon} MD3 vencida{data.seriesWon === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
          </div>
        </div>

        {/* Troféus grandes: é o único lugar onde eles são o assunto e não um
            adorno ao lado do nome numa tabela. */}
        {data.seriesWon > 0 && (
          <span className="text-2xl" title={`${data.seriesWon} MD3 vencidas`}>
            {data.seriesWon > 5 ? `🏆 x${data.seriesWon}` : '🏆'.repeat(data.seriesWon)}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Vitórias" value={`${data.wins}–${data.games - data.wins}`} />
        <Metric
          label="Winrate"
          value={`${data.winRate}%`}
          tone={data.winRate >= 50 ? 'good' : 'bad'}
        />
        <Metric label="KDA médio" value={data.avgKda.toFixed(2)} />
        <Metric label="K / D / A" value={kda} pequeno />
        <Metric label="Dano / min" value={String(data.avgDamagePerMinute)} />
        <Metric label="CS / min" value={String(data.avgCsPerMinute)} />
      </div>
    </Card>
  );
}

function Campeoes({ data }: { data: PlayerProfile }) {
  return (
    <Card padding={false} title={<CardTitle icon={Crown}>Campeões mais jogados</CardTitle>}>
      {data.championPodium.length === 0 ? (
        <div className="p-4">
          <EmptyState label="Sem partidas registradas." />
        </div>
      ) : (
        <ol className="divide-y divide-line/30">
          {data.championPodium.map((champion, index) => (
            <li
              key={champion.championName}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised/40"
            >
              <span
                className={`tabular w-4 shrink-0 text-sm font-bold ${
                  index === 0 ? 'text-gold' : 'text-ink-faint'
                }`}
              >
                {index + 1}
              </span>
              <ChampionIcon championName={champion.championName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {champion.championName}
                </p>
                <p className="text-xs text-ink-faint">
                  {champion.games} jogo{champion.games === 1 ? '' : 's'} ·{' '}
                  {champion.avgKda.toFixed(2)} KDA
                </p>
              </div>
              <span
                className={`tabular shrink-0 text-lg font-bold ${
                  champion.winRate >= 50 ? 'text-win' : 'text-loss'
                }`}
              >
                {champion.winRate}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function PorRole({ data }: { data: PlayerProfile }) {
  return (
    <Card title={<CardTitle icon={Swords}>Desempenho por role</CardTitle>}>
      <ul className="space-y-2.5">
        {data.byRole.map((role) => {
          const jogou = role.games > 0;
          return (
            <li key={role.role} className="flex items-center gap-3 text-sm">
              <span
                className={`w-20 shrink-0 text-xs font-semibold uppercase tracking-wider ${
                  jogou ? 'text-ink-muted' : 'text-ink-faint'
                }`}
              >
                {ROLE_LABEL[role.role]}
              </span>

              {/* "Nunca jogou" e "jogou e perdeu tudo" são coisas diferentes, e
                  a trilha sólida desenhava as duas igual: uma barra vazia do
                  mesmo tamanho, parecendo medição onde não há dado nenhum.
                  Sem jogo, a trilha vira tracejado -- lê como lacuna, não como
                  zero medido. */}
              {jogou ? (
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className={`h-full rounded-full ${
                      role.winRate >= 50 ? 'bg-win/70' : 'bg-loss/70'
                    }`}
                    style={{ width: `${role.winRate}%` }}
                  />
                </div>
              ) : (
                <div className="h-2 flex-1 rounded-full border border-dashed border-line/60" />
              )}

              <span
                className={`tabular w-28 shrink-0 text-right text-xs ${
                  jogou ? 'text-ink-muted' : 'text-ink-faint'
                }`}
              >
                {jogou ? `${role.wins}/${role.games} · ${role.winRate}%` : 'sem jogos'}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function UltimasPartidas({ partidas }: { partidas: RecentMatch[] }) {
  return (
    <Card
      padding={false}
      title={<CardTitle icon={History}>Últimas partidas</CardTitle>}
      action={
        partidas.length > 0 ? (
          <Link to="/historico" className="text-[11px] text-ink-faint hover:text-gold">
            ver histórico completo
          </Link>
        ) : undefined
      }
    >
      {partidas.length === 0 ? (
        <div className="p-4">
          <EmptyState label="Nenhuma partida registrada ainda." />
        </div>
      ) : (
        <ul className="divide-y divide-line/30">
          {partidas.map((partida) => (
            <LinhaDePartida key={partida.matchId} partida={partida} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LinhaDePartida({ partida }: { partida: RecentMatch }) {
  const kda = (partida.kills + partida.assists) / Math.max(partida.deaths, 1);
  const duracao = partida.gameDurationSec
    ? `${Math.round(partida.gameDurationSec / 60)} min`
    : null;

  return (
    <li
      // Faixa lateral na cor do resultado: dá para varrer a lista e ver a
      // sequência de vitórias e derrotas sem ler nada.
      className={`flex items-center gap-3 border-l-2 px-4 py-2.5 transition hover:bg-raised/40 ${
        partida.win ? 'border-win/60 bg-win/[0.03]' : 'border-loss/50 bg-loss/[0.02]'
      }`}
    >
      <ChampionIcon championName={partida.championName} size={38} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="truncate text-sm font-semibold text-ink">{partida.championName}</span>
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">
            {ROLE_LABEL[partida.rolePlayed]}
          </span>
          <Highlights stat={partida} />
        </p>
        <p className="truncate text-[11px] text-ink-faint">
          {partida.seriesName ?? new Date(partida.playedAt).toLocaleDateString('pt-BR')} · Jogo{' '}
          {partida.matchNumber}
          {duracao && ` · ${duracao}`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="tabular text-sm font-semibold text-ink">
          {partida.kills}/{partida.deaths}/{partida.assists}
        </p>
        <p className="tabular text-[11px] text-ink-faint">{kda.toFixed(2)} KDA</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="tabular text-xs text-ink-muted">
          {Math.round(partida.damage / 1000)}k dano
        </p>
        <p className="tabular text-[11px] text-ink-faint">{partida.cs} cs</p>
      </div>
    </li>
  );
}

function Metric({
  label,
  value,
  tone,
  pequeno = false,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  /** Para valores compostos (K/D/A), que não cabem no mesmo corpo dos outros. */
  pequeno?: boolean;
}) {
  const toneClass = tone === 'good' ? 'text-win' : tone === 'bad' ? 'text-loss' : 'text-ink';

  return (
    <div className="rounded-lg border border-line/50 bg-raised/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`tabular mt-1 font-bold ${pequeno ? 'text-base' : 'text-2xl'} ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
