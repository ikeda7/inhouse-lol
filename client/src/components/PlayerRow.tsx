import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ImageDown, Link2, Pencil, Plus, X, EyeOff, Eye, UserCheck } from 'lucide-react';
import { playersApi } from '../api/client';
import { useAction } from '../hooks/useAsync';
import { Avatar, Button, ErrorState, RoleBadge } from './ui';
import { ROLE_LABEL, ROLES, type Player, type RoleInput } from '../types';

const SELECTABLE_ROLES: RoleInput[] = [...ROLES, 'FILL'];

/** O que a lista mostra de cada um: o mesmo que o ranking sabe. */
export interface ResumoDoJogador {
  lugar: number;
  wins: number;
  losses: number;
  winRate: number;
  points: number;
}

/**
 * Os números à direita da linha. A lista era só cadastro (nome, Riot ID,
 * roles) e respondia "quem é do grupo", mas não "como ele está" -- para isso
 * era preciso abrir perfil por perfil. O placar é o número grande; o resto
 * fica em tinta fraca. Pontos em dourado: é o número que decide o ranking.
 */
function NumerosDoJogador({ resumo }: { resumo: ResumoDoJogador | null }) {
  if (!resumo) {
    return <span className="shrink-0 text-xs text-ink-faint">sem jogos</span>;
  }

  return (
    <div className="shrink-0 text-right">
      <p className="tabular text-sm font-semibold text-ink">
        {resumo.wins}–{resumo.losses}
        <span className={`ml-1.5 text-xs ${resumo.winRate >= 50 ? 'text-win' : 'text-loss'}`}>
          {resumo.winRate}%
        </span>
      </p>
      <p className="tabular text-[11px] text-ink-faint">
        {resumo.lugar}º · <span className="font-semibold text-gold">{resumo.points} pts</span>
      </p>
    </div>
  );
}

const ORIGEM_DA_FOTO: Record<Player['photoSource'], string> = {
  LOL_ICON: 'ícone do LoL',
  UPLOAD: 'foto enviada',
  NONE: 'sem foto',
};

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
 *
 * `podeEditar` falso tira o lapis e o olho: o cadastro e do admin, e o servidor
 * recusaria o clique de qualquer jeito.
 */
export function PlayerRow({
  player,
  podeEditar,
  mostrarConta,
  resumo,
  onChanged,
}: {
  player: Player;
  podeEditar: boolean;
  /** O selo "conta / sem conta": só faz sentido enquanto dá para criar conta. */
  mostrarConta: boolean;
  /**
   * Os números do jogador no ranking. `null` = nunca jogou; `undefined` = o
   * ranking ainda não chegou (ou falhou), e a coluna simplesmente não aparece.
   */
  resumo?: ResumoDoJogador | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [riotId, setRiotId] = useState(player.riotId ?? '');
  const [roles, setRoles] = useState<RoleInput[]>(player.roles);

  const [novaConta, setNovaConta] = useState('');

  const update = useAction(playersApi.update);
  const addAccount = useAction(playersApi.addAccount);
  const removeAccount = useAction(playersApi.removeAccount);
  const usarIcone = useAction(playersApi.usarIconeDoLol);

  const trocarPeloIcone = async () => {
    if (await usarIcone.run(player.id)) onChanged();
  };

  const adicionarConta = async () => {
    if (!(await addAccount.run(player.id, novaConta.trim()))) return;
    setNovaConta('');
    onChanged();
  };

  const removerConta = async (contaId: string) => {
    if (await removeAccount.run(player.id, contaId)) onChanged();
  };

  const erroDeConta = addAccount.error ?? removeAccount.error;

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
              className="py-1 text-[15px] font-semibold text-ink hover:text-gold hover:underline"
            >
              {player.name}
            </Link>

            {player.riotId ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400/70">
                <Link2 size={11} />
                {player.riotId}
              </span>
            ) : player.riotAccounts.length > 0 ? null : (
              <span
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400"
                title="Sem Riot ID, a importação automática não consegue identificar essa pessoa"
              >
                sem Riot ID
              </span>
            )}

            {/* Smurf: o nick some do texto principal para a linha não virar uma
                lista de contas, mas o selo avisa que a pessoa joga de mais de
                uma -- é o que explica partida dela aparecendo com outro nick. */}
            {player.riotAccounts.map((conta) => (
              <span
                key={conta.id}
                className="flex items-center gap-1 text-xs text-ink-faint"
                title="Conta extra: as partidas dela entram no mesmo jogador"
              >
                <Link2 size={11} />
                {conta.riotId}
              </span>
            ))}

            {/* Quem já tem conta ganha o selo; quem não tem aparece com um
                lembrete neutro -- não é erro, é convite. O e-mail nunca vem
                para cá: a lista é pública. Com o cadastro fechado ninguém cria
                conta, e "sem conta" em 12 de 17 linhas era só ruído. */}
            {mostrarConta &&
              (player.hasAccount ? (
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
                  title="Não tem conta no InHouse"
                >
                  sem conta
                </span>
              ))}

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

        {resumo !== undefined && <NumerosDoJogador resumo={resumo} />}

        {/* Botão só de ícone: o nome acessível leva o nome da pessoa, senão o
            leitor de tela lê quinze "Editar" iguais na lista. */}
        {podeEditar && (
          <>
            <button
              onClick={toggleActive}
              title={player.active ? 'Desativar (some do sorteio)' : 'Reativar'}
              aria-label={player.active ? `Desativar ${player.name}` : `Reativar ${player.name}`}
              // 36px de área para o dedo sem mudar o desenho: o ícone de 15px
              // sozinho era o alvo, e no celular o toque caía no botão do lado.
              className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-gold"
            >
              {player.active ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              onClick={() => setEditing(true)}
              title="Editar"
              aria-label={`Editar ${player.name}`}
              className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-gold"
            >
              <Pencil size={15} />
            </button>
          </>
        )}
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

      {/* Smurf. Fica aqui, e não num campo de texto com dois nicks, porque cada
          conta é uma linha própria no banco: é ela que recebe o PUUID quando a
          primeira partida daquela conta é importada. */}
      <div className="mt-2">
        <p className="text-[11px] text-ink-faint">Outras contas (smurf)</p>
        <ul className="mt-1.5 space-y-1">
          {player.riotAccounts.map((conta) => (
            <li key={conta.id} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-ink">
                <Link2 size={11} className="shrink-0 text-ink-faint" />
                {conta.riotId}
              </span>
              <button
                type="button"
                onClick={() => removerConta(conta.id)}
                title="Desligar essa conta"
                aria-label={`Desligar a conta ${conta.riotId} de ${player.name}`}
                className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-loss"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-1.5 flex gap-2">
          <input
            value={novaConta}
            onChange={(event) => setNovaConta(event.target.value)}
            placeholder="Outra conta: Nick#TAG"
            aria-label={`Outra conta de ${player.name}`}
            className="min-w-0 flex-1 rounded border border-line bg-raised px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
          />
          <Button
            variant="ghost"
            onClick={adicionarConta}
            loading={addAccount.loading}
            disabled={!novaConta.includes('#')}
          >
            <Plus size={14} />
            Adicionar
          </Button>
        </div>

        {erroDeConta && (
          <div className="mt-2">
            <ErrorState error={erroDeConta} />
          </div>
        )}
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

      {/* Foto. Sem conta para cada um trocar a sua, quem padroniza é o admin: o
          ícone é o que o cliente do LoL mandou na última partida da pessoa, e
          volta a se atualizar sozinho a cada importação. Grava na hora, fora do
          "Salvar", como as contas extras. */}
      <div className="mt-2">
        <p className="text-[11px] text-ink-faint">Foto</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Avatar photoUrl={player.photoUrl} name={player.name} size="sm" />
          <Button
            variant="ghost"
            onClick={trocarPeloIcone}
            loading={usarIcone.loading}
            aria-label={`Usar o ícone do LoL como foto de ${player.name}`}
          >
            <ImageDown size={14} />
            Usar ícone do LoL
          </Button>
          <span className="text-[11px] text-ink-muted">
            Hoje: {ORIGEM_DA_FOTO[player.photoSource]}
          </span>
        </div>
        {usarIcone.error && (
          <div className="mt-2">
            <ErrorState error={usarIcone.error} />
          </div>
        )}
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
