import { useState } from 'react';
import { UserPlus, Save } from 'lucide-react';
import { playersApi, statsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAction, useAsync } from '../hooks/useAsync';
import { Button, Card, CardTitle, ErrorState, LoadingState } from '../components/ui';
import { PlayerRow, type ResumoDoJogador } from '../components/PlayerRow';
import { ROLE_LABEL, ROLES, type Player, type RoleInput } from '../types';
import { contarPorFiltro, filtrarJogadores, type FiltroDeJogadores } from '../lib/filtroJogadores';

const SELECTABLE_ROLES: RoleInput[] = [...ROLES, 'FILL'];

/**
 * Cadastro e edicao de jogadores.
 *
 * A ordem em que as roles sao clicadas VIRA a ordem de preferencia (a primeira
 * e a main), porque e isso que o auto-balance usa para decidir quem sai da main.
 * Por isso o chip mostra a posicao escolhida.
 *
 * Cadastrar e editar e so do admin: para os outros a tela e a lista, sem o
 * formulario e sem os botoes da linha.
 */
export function PlayersPage() {
  const { data: players, loading, error, reload } = useAsync(() => playersApi.list(true));
  const { podeAdministrar, cadastroAberto } = useAuth();
  // Os números de cada um vêm do ranking. É enfeite da lista: se a busca
  // falhar, a lista abre sem a coluna em vez de virar tela de erro.
  const ranking = useAsync(() => statsApi.leaderboard('points'), []);
  const resumos = ranking.data
    ? new Map<string, ResumoDoJogador>(
        ranking.data.map((linha, indice) => [
          linha.playerId,
          {
            lugar: indice + 1,
            wins: linha.wins,
            losses: linha.losses,
            winRate: linha.winRate,
            points: linha.points,
          },
        ])
      )
    : null;

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

  // Quem não administra vê quem JOGA: inativo é assunto de cadastro. A ordem é
  // a do alfabeto de gente -- "amar dps" depois de "Vini" e "Ígor" no fim da
  // lista era a ordem do código do caractere, não a de um nome.
  const doGrupo = (players ?? []).filter((player) => podeAdministrar || player.active);
  const naTela = filtrarJogadores(doGrupo, filtro).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  );

  return (
    <div className="space-y-6">
      {podeAdministrar && (
        <Card title={<CardTitle icon={UserPlus}>Novo jogador</CardTitle>}>
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
      )}

      <Card
        destaque
        title={`Jogadores (${doGrupo.length})`}
        // Conta e vínculo são pendências de CADASTRO: interessam a quem cuida
        // dele. Para o resto do grupo a lista é a galera, não um painel de
        // pendências dos outros.
        action={
          podeAdministrar && (
            <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px]">
              {cadastroAberto && (
                <span className="text-ink-muted">
                  {comConta} de {ativos.length} com conta
                </span>
              )}
              {missingRiotId > 0 ? (
                <span className="text-amber-400/80">
                  {missingRiotId} sem Riot ID -- a importação automática não identifica essas
                  pessoas
                </span>
              ) : (
                <span className="text-emerald-400/70">todos vinculados</span>
              )}
            </span>
          )
        }
      >
        {loading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {players && (
          <>
            {podeAdministrar && (
              <FiltroDaLista
                players={players}
                filtro={filtro}
                comConta={cadastroAberto}
                onChange={setFiltro}
              />
            )}
            <ul className="divide-y divide-line/40">
              {naTela.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  podeEditar={podeAdministrar}
                  mostrarConta={cadastroAberto}
                  resumo={resumos ? (resumos.get(player.id) ?? null) : undefined}
                  onChanged={reload}
                />
              ))}
            </ul>
            {!podeAdministrar && (
              <p className="pt-3 text-xs text-ink-muted">
                Quem cadastra e edita jogadores é o admin do grupo.
              </p>
            )}
            {naTela.length === 0 && (
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
  comConta,
  onChange,
}: {
  players: Player[];
  filtro: FiltroDeJogadores;
  /** "Sem conta" só é pendência enquanto dá para criar conta. */
  comConta: boolean;
  onChange: (filtro: FiltroDeJogadores) => void;
}) {
  const contagem = contarPorFiltro(players);
  const opcoes = (Object.keys(ROTULO_DO_FILTRO) as FiltroDeJogadores[]).filter(
    (opcao) => comConta || opcao !== 'sem-conta'
  );
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar jogadores">
      {opcoes.map((opcao) => (
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
