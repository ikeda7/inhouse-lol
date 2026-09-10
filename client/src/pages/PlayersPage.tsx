import { useState } from 'react';
import { UserPlus, Save } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAction, useAsync } from '../hooks/useAsync';
import { Button, Card, ErrorState, LoadingState } from '../components/ui';
import { PlayerRow } from '../components/PlayerRow';
import { ROLE_LABEL, ROLES, type Player, type RoleInput } from '../types';
import { contarPorFiltro, filtrarJogadores, type FiltroDeJogadores } from '../lib/filtroJogadores';

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
  const [filtro, setFiltro] = useState<FiltroDeJogadores>('todos');

  const create = useAction(playersApi.create);

  // Só quem está ativo conta: inativo não entra no sorteio nem na importação.
  const ativos = (players ?? []).filter((p) => p.active);
  // Sem Riot ID o agente local nao consegue casar a pessoa com o scoreboard.
  const missingRiotId = ativos.filter((p) => !p.riotId).length;
  const comConta = ativos.filter((p) => p.hasAccount).length;

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
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px]">
            <span className="text-ink-muted">
              {comConta} de {ativos.length} com conta
            </span>
            {missingRiotId > 0 ? (
              <span className="text-amber-400/80">
                {missingRiotId} sem Riot ID -- a importação automática não identifica essas pessoas
              </span>
            ) : (
              <span className="text-emerald-400/70">todos vinculados</span>
            )}
          </span>
        }
      >
        {loading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {players && (
          <>
            <FiltroDaLista players={players} filtro={filtro} onChange={setFiltro} />
            <ul className="divide-y divide-line/40">
              {filtrarJogadores(players, filtro).map((player) => (
                <PlayerRow key={player.id} player={player} onChanged={reload} />
              ))}
            </ul>
            {filtrarJogadores(players, filtro).length === 0 && (
              <p className="py-3 text-center text-xs text-ink-muted">
                Ninguém nessa lista: todo mundo em dia.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

const ROTULO_DO_FILTRO: Record<FiltroDeJogadores, string> = {
  todos: 'Todos',
  'sem-conta': 'Sem conta',
  'sem-riot-id': 'Sem Riot ID',
};

/** Atalho para cobrar quem falta, com a contagem de cada caso à vista. */
function FiltroDaLista({
  players,
  filtro,
  onChange,
}: {
  players: Player[];
  filtro: FiltroDeJogadores;
  onChange: (filtro: FiltroDeJogadores) => void;
}) {
  const contagem = contarPorFiltro(players);
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar jogadores">
      {(Object.keys(ROTULO_DO_FILTRO) as FiltroDeJogadores[]).map((opcao) => (
        <button
          key={opcao}
          type="button"
          aria-pressed={filtro === opcao}
          onClick={() => onChange(opcao)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            filtro === opcao
              ? 'border-gold bg-gold/15 text-ink'
              : 'border-line text-ink-muted hover:border-gold/50'
          }`}
        >
          {ROTULO_DO_FILTRO[opcao]} <span className="tabular">{contagem[opcao]}</span>
        </button>
      ))}
    </div>
  );
}
