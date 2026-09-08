import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Link2, Pencil, X, EyeOff, Eye } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAction } from '../hooks/useAsync';
import { Button, ErrorState, RoleBadge } from './ui';
import { ROLE_LABEL, ROLES, type Player, type RoleInput } from '../types';

const SELECTABLE_ROLES: RoleInput[] = [...ROLES, 'FILL'];

/**
 * Linha de jogador com edicao inline.
 *
 * O Riot ID ganhou destaque proprio porque e ele que liga o cadastro ao
 * historico do cliente do LoL: o agente local casa `riotId` -> PUUID sozinho,
 * entao preencher esse campo e o unico passo manual para a importacao
 * automatica funcionar. Sem ele, a partida chega e o servidor nao sabe quem e
 * quem.
 *
 * E ele NAO precisa da chave da Riot: o PUUID vem junto com os dados do jogo.
 */
export function PlayerRow({ player, onChanged }: { player: Player; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [riotId, setRiotId] = useState(player.riotId ?? '');
  const [roles, setRoles] = useState<RoleInput[]>(player.roles);

  const update = useAction(playersApi.update);

  const cancel = () => {
    setName(player.name);
    setRiotId(player.riotId ?? '');
    setRoles(player.roles);
    setEditing(false);
  };

  const save = async () => {
    const result = await update.run(player.id, {
      name: name.trim(),
      riotId: riotId.trim() || null,
      roles,
    });
    if (result) {
      setEditing(false);
      onChanged();
    }
  };

  const toggleRole = (role: RoleInput) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );

  const toggleActive = async () => {
    if (await update.run(player.id, { active: !player.active })) onChanged();
  };

  if (!editing) {
    return (
      <li className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/jogadores/${player.id}`}
              className="text-sm font-medium hover:text-gold-400 hover:underline"
            >
              {player.name}
            </Link>

            {player.riotId ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400/70">
                <Link2 size={11} />
                {player.riotId}
              </span>
            ) : (
              <span
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400"
                title="Sem Riot ID, a importacao automatica nao consegue identificar essa pessoa"
              >
                sem Riot ID
              </span>
            )}

            {!player.active && (
              <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                inativo
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            {player.roles.map((role, index) => (
              <RoleBadge key={role} role={role} primary={index === 0} />
            ))}
          </div>
        </div>

        <button
          onClick={toggleActive}
          title={player.active ? 'Desativar (some do sorteio)' : 'Reativar'}
          className="shrink-0 text-gold-400/40 hover:text-gold-400"
        >
          {player.active ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button
          onClick={() => setEditing(true)}
          title="Editar"
          className="shrink-0 text-gold-400/40 hover:text-gold-400"
        >
          <Pencil size={15} />
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-gold-400/40 bg-gold-400/5 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-gold-400/70">
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-hextech-700 bg-hextech-800/60 px-2 py-1.5 text-xs text-gold-300 focus:border-gold-400 focus:outline-none"
          />
        </label>

        <label className="text-[11px] text-gold-400/70">
          Riot ID <span className="text-gold-400/40">(Nick#TAG)</span>
          <input
            value={riotId}
            onChange={(event) => setRiotId(event.target.value)}
            placeholder="Cangosul#PCBR"
            className="mt-1 w-full rounded border border-hextech-700 bg-hextech-800/60 px-2 py-1.5 text-xs text-gold-300 placeholder:text-gold-400/25 focus:border-gold-400 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-2">
        <p className="text-[11px] text-gold-400/70">
          Roles (ordem = preferencia; a primeira e a main)
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SELECTABLE_ROLES.map((role) => {
            const position = roles.indexOf(role);
            const selected = position >= 0;
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                aria-pressed={selected}
                className={`rounded border px-2 py-1 text-[11px] font-semibold transition ${
                  selected
                    ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                    : 'border-hextech-700 text-gold-400/60 hover:border-gold-400/50'
                }`}
              >
                {selected && <span className="mr-1 text-gold-400">{position + 1}.</span>}
                {ROLE_LABEL[role]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button onClick={save} loading={update.loading} disabled={roles.length === 0}>
          <Check size={14} />
          Salvar
        </Button>
        <Button variant="ghost" onClick={cancel}>
          <X size={14} />
          Cancelar
        </Button>
      </div>

      {update.error && (
        <div className="mt-2">
          <ErrorState error={update.error} />
        </div>
      )}
    </li>
  );
}
