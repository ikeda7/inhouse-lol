import { useState } from 'react';
import { UserPlus, Save } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAction, useAsync } from '../hooks/useAsync';
import { Button, Card, ErrorState, LoadingState } from '../components/ui';
import { PlayerRow } from '../components/PlayerRow';
import { ROLE_LABEL, ROLES, type RoleInput } from '../types';

const SELECTABLE_ROLES: RoleInput[] = [...ROLES, 'FILL'];

/**
 * Cadastro e edicao de jogadores.
 *
 * A ordem em que as roles sao clicadas VIRA a ordem de preferencia (a primeira
 * e a main), porque e isso que o auto-balance usa para decidir quem sai da main.
 * Por isso o chip mostra a posicao escolhida.
 */
export function PlayersPage() {
  const { data: players, loading, error, reload } = useAsync(() => playersApi.list(true));

  const [name, setName] = useState('');
  const [riotId, setRiotId] = useState('');
  const [roles, setRoles] = useState<RoleInput[]>([]);

  const create = useAction(playersApi.create);

  // Sem Riot ID o agente local nao consegue casar a pessoa com o scoreboard.
  const missingRiotId = (players ?? []).filter((p) => !p.riotId).length;

  const toggleRole = (role: RoleInput) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );

  const handleCreate = async () => {
    const created = await create.run({
      name: name.trim(),
      roles,
      riotId: riotId.trim() || null,
    });
    if (created) {
      setName('');
      setRiotId('');
      setRoles([]);
      reload();
    }
  };

  const canSubmit = name.trim().length > 0 && roles.length > 0;

  return (
    <div className="space-y-6">
      <Card
        title={
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
            <UserPlus size={16} />
            Novo jogador
          </h2>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-ink-faint">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como a galera chama"
              className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
            />
          </label>
          <label className="text-xs text-ink-faint">
            Riot ID (opcional)
            <input
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              placeholder="Nick#BR1"
              className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs text-ink-faint">
            Roles (clique na ordem de preferencia -- a primeira e a main)
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SELECTABLE_ROLES.map((role) => {
              const position = roles.indexOf(role);
              const selected = position >= 0;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  aria-pressed={selected}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? 'border-gold bg-gold/15 text-ink'
                      : 'border-line text-ink-faint hover:border-gold/50'
                  }`}
                >
                  {selected && <span className="mr-1 text-gold">{position + 1}.</span>}
                  {ROLE_LABEL[role]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <Button onClick={handleCreate} disabled={!canSubmit} loading={create.loading}>
            <Save size={16} />
            Cadastrar
          </Button>
        </div>

        {create.error && (
          <div className="mt-3">
            <ErrorState error={create.error} />
          </div>
        )}
      </Card>

      <Card
        title={`Jogadores (${players?.length ?? 0})`}
        action={
          missingRiotId > 0 ? (
            <span className="text-[11px] text-amber-400/80">
              {missingRiotId} sem Riot ID -- a importação automática não identifica essas pessoas
            </span>
          ) : (
            <span className="text-[11px] text-emerald-400/70">todos vinculados</span>
          )
        }
      >
        {loading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {players && (
          <ul className="divide-y divide-line/40">
            {players.map((player) => (
              <PlayerRow key={player.id} player={player} onChanged={reload} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
