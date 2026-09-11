import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Link2, Pencil, X, EyeOff, Eye, UserCheck } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAction } from '../hooks/useAsync';
import { Avatar, Button, ErrorState, RoleBadge } from './ui';
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
        {/* Quem já reivindicou a conta aparece com a própria foto; quem não,
            com as iniciais. A lista é o lugar onde a galera se identifica, e
            uma coluna só de texto obriga a ler para achar alguém.
            `md`, não `sm`: a linha tem duas alturas de conteúdo (nome + roles)
            e um avatar pequeno demais fica boiando no meio dela. */}
        <Avatar
          photoUrl={player.photoUrl}
          name={player.name}
          size="md"
          // Inativo perde a COR, não a legibilidade -- quem carrega o recado é
          // o selo "inativo" ao lado do nome. Opacidade aqui derrubaria as
          // iniciais junto, e a linha existe para eu achar a pessoa.
          className={player.active ? '' : 'grayscale'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/jogadores/${player.id}`}
              className="text-sm font-medium hover:text-gold hover:underline"
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
                title="Sem Riot ID, a importação automática não consegue identificar essa pessoa"
              >
                sem Riot ID
              </span>
            )}

            {/* Quem já tem conta ganha o selo; quem não tem aparece com um
                lembrete neutro -- não é erro, é convite. O e-mail nunca vem
                para cá: a lista é pública. */}
            {player.hasAccount ? (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold uppercase text-win"
                title="Já criou a conta no InHouse"
              >
                <UserCheck size={11} />
                conta
              </span>
            ) : (
              <span
                className="rounded bg-overlay px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-muted"
                title="Ainda não criou a conta. É em Entrar → Criar conta."
              >
                sem conta
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

        {/* Botão só de ícone: o nome acessível leva o nome da pessoa, senão o
            leitor de tela lê quinze "Editar" iguais na lista. */}
        <button
          onClick={toggleActive}
          title={player.active ? 'Desativar (some do sorteio)' : 'Reativar'}
          aria-label={player.active ? `Desativar ${player.name}` : `Reativar ${player.name}`}
          className="shrink-0 text-ink-faint hover:text-gold"
        >
          {player.active ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button
          onClick={() => setEditing(true)}
          title="Editar"
          aria-label={`Editar ${player.name}`}
          className="shrink-0 text-ink-faint hover:text-gold"
        >
          <Pencil size={15} />
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-gold/40 bg-gold/5 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-ink-faint">
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-line bg-raised px-2 py-1.5 text-xs text-ink focus:border-gold focus:outline-none"
          />
        </label>

        <label className="text-[11px] text-ink-faint">
          Riot ID <span className="text-ink-faint">(Nick#TAG)</span>
          <input
            value={riotId}
            onChange={(event) => setRiotId(event.target.value)}
            placeholder="Cangosul#PCBR"
            className="mt-1 w-full rounded border border-line bg-raised px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-2">
        <p className="text-[11px] text-ink-faint">
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
