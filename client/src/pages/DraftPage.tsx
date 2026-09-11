import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, Users, RefreshCw, ArrowRight, Check, Crown, Radio, Swords } from 'lucide-react';
import { draftApi, playersApi } from '../api/client';
import { useAction, useAsync } from '../hooks/useAsync';
import { Avatar, Button, Card, ErrorState, LoadingState, RoleBadge } from '../components/ui';
import { TeamCard } from '../components/TeamCard';
import { CaptainsDraft } from '../components/CaptainsDraft';
import { fromAutoBalance, fromCaptains, saveActiveDraft } from '../lib/activeDraft';
import {
  ROLES,
  ROLE_LABEL,
  type AutoBalanceResult,
  type CaptainSelectionMode,
  type CaptainsDraftState,
  type Player,
} from '../types';

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

  // O modo Capitães divide a tela com o sorteio em vez de ter aba própria: o
  // começo é idêntico (marcar quem veio hoje), e o grupo decide DEPOIS de ter
  // os 10 se vai sortear ou draftar. Aba separada duplicaria essa lista.
  const [modoCapitaes, setModoCapitaes] = useState(false);
  const [criterio, setCriterio] = useState<CaptainSelectionMode>('TOP_WINRATE');
  /** Modo "Escolher": o primeiro marcado tira o azul, o segundo o vermelho. */
  const [capitaes, setCapitaes] = useState<string[]>([]);
  const [draft, setDraft] = useState<CaptainsDraftState | null>(null);

  const draw = useAction(draftApi.autoBalance);
  const iniciar = useAction(draftApi.startCaptains);
  const escolher = useAction(draftApi.pick);
  const abrirSala = useAction(draftApi.criarSala);

  const times = draft?.teams ?? null;

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

  // Quem foi desmarcado da lista deixa de ser capitão sem ninguém precisar
  // lembrar de desfazer a escolha.
  const capitaesMarcados = capitaes.filter((id) => selected.has(id));
  const capitaesEscolhidos =
    criterio === 'MANUAL' && capitaesMarcados.length === 2
      ? (capitaesMarcados as [string, string])
      : undefined;
  const capitaesProntos = criterio !== 'MANUAL' || capitaesEscolhidos !== undefined;

  const alternarCapitao = (playerId: string) =>
    setCapitaes((atual) => {
      const validos = atual.filter((id) => selected.has(id));
      if (validos.includes(playerId)) return validos.filter((id) => id !== playerId);
      return validos.length < 2 ? [...validos, playerId] : validos;
    });

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
    navigate('/serie');
  };

  const handleIniciarCapitaes = async () => {
    const inicial = await iniciar.run([...selected], criterio, undefined, capitaesEscolhidos);
    if (inicial) setDraft(inicial);
  };

  const handleAoVivo = async () => {
    const sala = await abrirSala.run([...selected], criterio, undefined, capitaesEscolhidos);
    // Vai direto para a sala: o link que o grupo recebe e o desta pagina, e
    // quem abriu tem que estar nela para copiar o link.
    if (sala) navigate(`/draft/${sala.code}`);
  };

  const handleEscolher = async (playerId: string) => {
    if (!draft) return;
    const proximo = await escolher.run(draft, playerId);
    // O servidor devolve o estado inteiro e só manda `pickOrder` no /start.
    // Sem carregar a fila adiante, o desenho do snake sumiria na 1ª escolha.
    if (proximo) setDraft({ ...proximo, pickOrder: draft.pickOrder });
  };

  const handleUsarTimesDoDraft = () => {
    if (!times) return;
    saveActiveDraft(fromCaptains(times));
    setConfirmed(true);
    navigate('/serie');
  };

  /** Trocar de modo joga fora o resultado do outro -- misturar confundiria. */
  const trocarModo = (paraCapitaes: boolean) => {
    setModoCapitaes(paraCapitaes);
    setResult(null);
    setDraft(null);
    setConfirmed(false);
  };

  if (loading) return <LoadingState label="Carregando jogadores..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // Quem vai jogar sem Riot ID não é reconhecido na importação: a partida
  // chega e é recusada. Melhor saber aqui, antes do jogo, do que no fim dele.
  const semRiotId = sortedPlayers.filter((p) => selected.has(p.id) && !p.riotId);

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

        {semRiotId.length > 0 && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
            {semRiotId.map((p) => p.name).join(', ')} {semRiotId.length === 1 ? 'está' : 'estão'}{' '}
            sem Riot ID: a partida chega e o servidor não sabe quem é quem. Preencha em Jogadores
            antes de jogar.
          </p>
        )}

        {sortedPlayers.length < REQUIRED_PLAYERS && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
            Ha apenas {sortedPlayers.length} jogadores cadastrados. O 5x5 precisa de{' '}
            {REQUIRED_PLAYERS} -- cadastre mais em Jogadores.
          </p>
        )}

        {/* Cobertura à esquerda, o que fazer à direita: as duas coisas nascem
            da mesma seleção e cabem lado a lado numa tela larga. Empilhada, a
            cobertura esticava por 1330px para mostrar cinco números. */}
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
          <CoberturaDeRoles escolhidos={sortedPlayers.filter((p) => selected.has(p.id))} />

          <div>
            {/* Escolha de modo: os dois começam com os mesmos 10, e é aqui que
                o caminho se separa. */}
            <div className="flex gap-0.5 rounded-lg bg-raised p-0.5" role="group" aria-label="Modo">
              {[
                { valor: false, rotulo: 'Sorteio automático', icone: Dices },
                { valor: true, rotulo: 'Modo capitães', icone: Crown },
              ].map(({ valor, rotulo, icone: Icone }) => (
                <button
                  key={rotulo}
                  onClick={() => trocarModo(valor)}
                  aria-pressed={modoCapitaes === valor}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    modoCapitaes === valor
                      ? 'bg-overlay text-ink shadow-sm'
                      : 'text-ink-faint hover:text-ink-muted'
                  }`}
                >
                  <Icone size={15} />
                  {rotulo}
                </button>
              ))}
            </div>

            {!modoCapitaes && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={handleDraw} disabled={!canDraw} loading={draw.loading}>
                  <Dices size={16} />
                  {result ? 'Sortear de novo' : 'Sortear times'}
                </Button>
                {result && (
                  <Button variant="ghost" onClick={handleDraw} loading={draw.loading}>
                    <RefreshCw size={16} />
                    Não gostei, tenta outro
                  </Button>
                )}
              </div>
            )}

            {modoCapitaes && !draft && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    Como escolher os capitães
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['TOP_WINRATE', 'Maior winrate'],
                        ['LAST_LOSERS', 'Quem perdeu o último'],
                        ['RANDOM', 'Aleatório'],
                        ['MANUAL', 'Escolher'],
                      ] as [CaptainSelectionMode, string][]
                    ).map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        onClick={() => setCriterio(valor)}
                        aria-pressed={criterio === valor}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                          criterio === valor
                            ? 'border-gold/60 bg-gold/10 text-gold'
                            : 'border-line/60 bg-raised/40 text-ink-faint hover:border-line'
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>

                {criterio === 'MANUAL' && (
                  <EscolherCapitaes
                    jogadores={sortedPlayers.filter((p) => selected.has(p.id))}
                    capitaes={capitaesMarcados}
                    onToggle={alternarCapitao}
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleIniciarCapitaes}
                    disabled={!canDraw || !capitaesProntos}
                    loading={iniciar.loading}
                  >
                    <Swords size={16} />
                    Começar o draft
                  </Button>

                  {/* Duas formas do mesmo draft: aqui só nesta tela, ou numa sala
                  com link para os dez acompanharem. A sala custa uma linha no
                  banco, então não é o padrão -- é escolha explícita. */}
                  <Button
                    variant="ghost"
                    onClick={handleAoVivo}
                    disabled={!canDraw || !capitaesProntos}
                    loading={abrirSala.loading}
                  >
                    <Radio size={16} />
                    Draft ao vivo (com link)
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {(draw.error || iniciar.error || abrirSala.error) && (
          <div className="mt-3">
            <ErrorState error={(draw.error ?? iniciar.error ?? abrirSala.error)!} />
          </div>
        )}
      </Card>

      {modoCapitaes && draft && (
        <CaptainsDraft
          state={draft}
          onPick={handleEscolher}
          escolhendo={escolher.loading}
          erro={escolher.error}
          onReiniciar={() => setDraft(null)}
        />
      )}

      {times && (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <TeamCard team={times.blueTeam} />
            <TeamCard team={times.redTeam} />
          </div>

          <div className="flex justify-center">
            <Button onClick={handleUsarTimesDoDraft}>
              {confirmed ? <Check size={16} /> : <ArrowRight size={16} />}
              Usar esses times na série
            </Button>
          </div>

          {/* As roles saem do mesmo distribuidor do sorteio: os capitães
              escolhem PESSOAS, e quem resolve quem joga o quê dentro do time é
              o pool declarado de cada um. */}
          <p className="text-center text-xs text-ink-faint">
            Os capitães escolheram os times; as roles foram distribuídas dentro de cada um pelo pool
            declarado.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <TeamCard team={result.blueTeam} averageRating />
            <TeamCard team={result.redTeam} averageRating />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={handleUseTeams}>
              {confirmed ? <Check size={16} /> : <ArrowRight size={16} />}
              Usar esses times na série
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

/** Cada role precisa de 2 pessoas -- uma por time. */
const POR_ROLE = 2;

/**
 * Quantos dos marcados conseguem jogar cada role.
 *
 * Existe porque o sorteio pode **falhar de vez**: o backend checa a condição de
 * Hall e recusa com "composição impossível" quando gente demais só cabe em
 * roles de menos. Antes disto a tela não dava pista nenhuma -- a pessoa marcava
 * dez, clicava, e só então descobria que faltava quem jogasse Support.
 *
 * Contar FILL em todas as roles não é aproximação: o `autoBalance` expande FILL
 * na máscara de elegibilidade ("já com FILL expandido", em `lib/autoBalance.ts`).
 * Ele custa mais caro na hora de escolher, e por isso aparece separado aqui --
 * uma role coberta só por FILL passa, mas passa mal.
 */
function CoberturaDeRoles({ escolhidos }: { escolhidos: Player[] }) {
  if (escolhidos.length === 0) return null;

  const cobertura = ROLES.map((role) => {
    const nominais = escolhidos.filter((p) => p.roles.includes(role)).length;
    const viaFill = escolhidos.filter(
      (p) => !p.roles.includes(role) && p.roles.includes('FILL')
    ).length;
    return { role, nominais, viaFill, total: nominais + viaFill };
  });

  const faltando = cobertura.filter((c) => c.total < POR_ROLE);

  return (
    <div className="rounded-lg border border-line/40 bg-canvas/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
        Cobertura de roles
      </p>

      <ul className="grid grid-cols-5 gap-2">
        {cobertura.map(({ role, nominais, viaFill, total }) => {
          const falta = total < POR_ROLE;
          const apertado = total === POR_ROLE;
          return (
            <li key={role} className="text-center">
              <p
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  falta ? 'text-loss' : 'text-ink-faint'
                }`}
              >
                {ROLE_LABEL[role]}
              </p>
              <p
                className={`tabular text-lg font-bold ${
                  falta ? 'text-loss' : apertado ? 'text-warn' : 'text-ink'
                }`}
                title={
                  viaFill > 0
                    ? `${nominais} no pool declarado + ${viaFill} via Fill`
                    : `${nominais} no pool declarado`
                }
              >
                {total}
              </p>
              {viaFill > 0 && (
                <p className="text-[9px] leading-none text-ink-faint">{viaFill} fill</p>
              )}
            </li>
          );
        })}
      </ul>

      {faltando.length > 0 ? (
        <p className="mt-2.5 border-t border-line/30 pt-2 text-[11px] text-loss">
          {faltando.map((c) => ROLE_LABEL[c.role]).join(' e ')}{' '}
          {faltando.length === 1 ? 'não tem' : 'não têm'} {POR_ROLE} jogadores. O sorteio vai
          recusar essa composição.
        </p>
      ) : (
        <p className="mt-2.5 border-t border-line/30 pt-2 text-[11px] text-ink-faint">
          Toda role tem pelo menos {POR_ROLE}. Amarelo é o mínimo: dá para sortear, mas ninguém
          sobra se alguém trocar.
        </p>
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
        // "Não cabe mais" é dito pela BORDA e pelo cursor, nunca apagando a
        // pessoa. A `opacity-40` que estava aqui derrubava o nome para 3.4:1
        // -- medido -- e levava as roles junto. Numa tela cuja única tarefa é
        // reconhecer quem veio, apagar cinco nomes apaga a tarefa.
        className={`flex items-center gap-3 rounded-lg border p-2.5 transition ${
          checked
            ? 'border-gold/60 bg-gold/10'
            : disabled
              ? 'cursor-not-allowed border-line/30 bg-raised/20'
              : 'cursor-pointer border-line/60 bg-raised/40 hover:border-line'
        }`}
        title={
          disabled ? `Já tem ${REQUIRED_PLAYERS} marcados -- desmarque alguém antes` : undefined
        }
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-[#d4b26a]"
        />
        <Avatar photoUrl={player.photoUrl} name={player.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-1.5 text-sm font-medium ${disabled ? 'text-ink-muted' : 'text-ink'}`}
          >
            <span className="truncate">{player.name}</span>
            {!player.riotId && (
              <span
                className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold uppercase text-amber-400"
                title="Sem Riot ID: a partida chega e o servidor não sabe quem é essa pessoa"
              >
                sem Riot ID
              </span>
            )}
          </p>
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

/**
 * Capitães escolhidos na mão, entre os 10 marcados.
 *
 * O primeiro clicado tira o azul e o segundo o vermelho; clicar de novo
 * desfaz. As cores são as dos times, porque é isso que cada um vai tirar.
 */
function EscolherCapitaes({
  jogadores,
  capitaes,
  onToggle,
}: {
  jogadores: Player[];
  capitaes: string[];
  onToggle: (playerId: string) => void;
}) {
  if (jogadores.length < REQUIRED_PLAYERS) {
    return (
      <p className="text-xs text-ink-muted">
        Marque os {REQUIRED_PLAYERS} primeiro; os capitães saem de quem vai jogar.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-muted">
        Clique em dois: o primeiro tira o time azul, o segundo o vermelho.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {jogadores.map((jogador) => {
          const posicao = capitaes.indexOf(jogador.id);
          const lado = posicao === 0 ? 'azul' : posicao === 1 ? 'vermelho' : null;
          return (
            <button
              key={jogador.id}
              type="button"
              onClick={() => onToggle(jogador.id)}
              aria-pressed={lado !== null}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                lado === 'azul'
                  ? 'border-blue/60 bg-blue/15 text-ink'
                  : lado === 'vermelho'
                    ? 'border-red/60 bg-red/15 text-ink'
                    : 'border-line/60 bg-raised/40 text-ink-muted hover:border-line'
              }`}
            >
              {jogador.name}
              {lado && <span className="ml-1 text-[10px] uppercase text-ink-muted">· {lado}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
