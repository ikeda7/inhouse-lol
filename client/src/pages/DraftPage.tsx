import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, Users, RefreshCw, ArrowRight, Check, Crown } from 'lucide-react';
import { draftApi, playersApi } from '../api/client';
import { useAction, useAsync } from '../hooks/useAsync';
import { Button, Card, ErrorState, LoadingState, RoleBadge } from '../components/ui';
import { TeamCard } from '../components/TeamCard';
import { fromAutoBalance, saveActiveDraft } from '../lib/activeDraft';
import type { AutoBalanceResult, Player } from '../types';

const REQUIRED_PLAYERS = 10;

/**
 * Tela do sorteio: marca quem veio hoje e roda o auto-balance.
 *
 * O botao so libera com exatamente 10 selecionados. O backend recusaria de
 * qualquer jeito, mas travar aqui evita uma ida ao servidor para ouvir "nao".
 */
export function DraftPage() {
  const navigate = useNavigate();
  const { data: players, loading, error, reload } = useAsync(() => playersApi.list());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AutoBalanceResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const draw = useAction(draftApi.autoBalance);

  const sortedPlayers = useMemo(
    () => [...(players ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  const toggle = (playerId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else if (next.size < REQUIRED_PLAYERS) {
        next.add(playerId);
      }
      return next;
    });

  const selectAll = () =>
    setSelected(new Set(sortedPlayers.slice(0, REQUIRED_PLAYERS).map((p) => p.id)));

  const canDraw = selected.size === REQUIRED_PLAYERS;

  const handleDraw = async () => {
    const drawn = await draw.run([...selected], {});
    if (drawn) {
      setResult(drawn);
      setConfirmed(false);
    }
  };

  const handleUseTeams = () => {
    if (!result) return;
    saveActiveDraft(fromAutoBalance(result));
    setConfirmed(true);
    navigate('/noite');
  };

  if (loading) return <LoadingState label="Carregando jogadores..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <Card
        title={
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
            <Users size={16} />
            Quem veio hoje
          </h2>
        }
        action={
          <div className="flex items-center gap-3">
            {sortedPlayers.length >= REQUIRED_PLAYERS && selected.size === 0 && (
              <button
                onClick={selectAll}
                className="text-xs font-semibold text-ink-faint hover:text-gold"
              >
                marcar todos
              </button>
            )}
            <span
              className={`text-xs font-semibold ${canDraw ? 'text-emerald-400' : 'text-ink-faint'}`}
            >
              {selected.size} / {REQUIRED_PLAYERS}
            </span>
          </div>
        }
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sortedPlayers.map((player) => (
            <PlayerToggle
              key={player.id}
              player={player}
              checked={selected.has(player.id)}
              disabled={!selected.has(player.id) && selected.size >= REQUIRED_PLAYERS}
              onToggle={() => toggle(player.id)}
            />
          ))}
        </ul>

        {sortedPlayers.length < REQUIRED_PLAYERS && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
            Ha apenas {sortedPlayers.length} jogadores cadastrados. O 5x5 precisa de{' '}
            {REQUIRED_PLAYERS} -- cadastre mais em Jogadores.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleDraw} disabled={!canDraw} loading={draw.loading}>
            <Dices size={16} />
            {result ? 'Sortear de novo' : 'Sortear times'}
          </Button>
          {result && (
            <Button variant="ghost" onClick={handleDraw} loading={draw.loading}>
              <RefreshCw size={16} />
              Nao gostei, tenta outro
            </Button>
          )}
        </div>

        {draw.error && (
          <div className="mt-3">
            <ErrorState error={draw.error} />
          </div>
        )}
      </Card>

      {result && (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <TeamCard team={result.blueTeam} averageRating />
            <TeamCard team={result.redTeam} averageRating />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={handleUseTeams}>
              {confirmed ? <Check size={16} /> : <ArrowRight size={16} />}
              Usar esses times na noite
            </Button>
          </div>

          {/* Transparencia do algoritmo: a seed permite reproduzir um sorteio
              contestado, e o custo justifica as escolhas de role. */}
          <p className="text-center text-xs text-ink-faint">
            Diferenca de rating: {result.ratingDiff} · custo de roles: {result.comfortCost} ·{' '}
            {result.solutionsEvaluated} composicoes avaliadas · seed {result.seed}
          </p>
          <p className="flex items-center justify-center gap-4 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <Crown size={11} className="text-gold" /> na role principal
            </span>
            <span>2a/3a = opcao do pool</span>
            <span>fill = preencheu a vaga</span>
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerToggle({
  player,
  checked,
  disabled,
  onToggle,
}: {
  player: Player;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition ${
          checked
            ? 'border-gold/60 bg-gold/10'
            : 'border-line/60 bg-raised/40 hover:border-line'
        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 accent-[#d4b26a]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{player.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {player.roles.map((role, index) => (
              <RoleBadge key={role} role={role} primary={index === 0} />
            ))}
          </div>
        </div>
      </label>
    </li>
  );
}
