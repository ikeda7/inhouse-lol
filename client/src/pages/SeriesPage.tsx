import { useState } from 'react';
import {
  Play,
  Swords,
  FlagTriangleRight,
  Download,
  ClipboardList,
  Terminal,
  Trash2,
} from 'lucide-react';
import { playersApi, riotApi, seriesApi } from '../api/client';
import { useAction, useAsync } from '../hooks/useAsync';
import { useChampions } from '../hooks/useChampions';
import { Button, Card, EmptyState, ErrorState, LoadingState, RoleBadge } from '../components/ui';
import { BurnedChampions } from '../components/BurnedChampions';
import { MatchForm, type PrefilledSlot } from '../components/MatchForm';
import { clearActiveDraft, loadActiveDraft } from '../lib/activeDraft';
import { elencoDoTimeA, ladoDoTimeA } from '../lib/timeDaSerie';
import { NaSerie } from '../components/NaSerie';
import { ROLES, type Role, type SeriesDetail, type TeamSide } from '../types';

/**
 * A "noite de jogos": a MD3 em andamento.
 *
 * Concentra o que se usa AO VIVO -- placar, queimados do Fearless, os times
 * sorteados, o registro do jogo que acabou e a MD3 até agora (os jogos somados
 * por jogador, o mesmo bloco do Histórico). Estatistica historica fica no
 * dashboard.
 */
export function SeriesPage() {
  const series = useAsync(() => seriesApi.current());
  const players = useAsync(() => playersApi.list());
  const { manifest } = useChampions();

  const [registering, setRegistering] = useState(false);
  const [matchIdInput, setMatchIdInput] = useState('');
  const [draft, setDraft] = useState(() => loadActiveDraft());

  const createSeries = useAction(seriesApi.create);
  const importMatch = useAction(riotApi.importMatch);
  const finishSeries = useAction(seriesApi.finish);

  if (series.loading) return <LoadingState label="Carregando a noite de jogos..." />;
  if (series.error) return <ErrorState error={series.error} onRetry={series.reload} />;

  if (!series.data) {
    return (
      <Card title="Série em andamento">
        <EmptyState label="Nenhuma MD3 em andamento." />
        <div className="flex justify-center">
          <Button
            onClick={async () => {
              if (await createSeries.run({ fearless: true })) series.reload();
            }}
            loading={createSeries.loading}
          >
            <Play size={16} />
            Abrir nova MD3
          </Button>
        </div>
        {createSeries.error && (
          <div className="mt-3">
            <ErrorState error={createSeries.error} />
          </div>
        )}
      </Card>
    );
  }

  const current = series.data;
  const nextMatchNumber = current.matches.length + 1;
  const prefill: PrefilledSlot[] | undefined = draft?.slots.map((slot) => ({
    playerId: slot.playerId,
    teamSide: slot.teamSide,
    rolePlayed: slot.rolePlayed,
  }));
  const elencoA = elencoDoTimeA(current.matches);
  const nomes = nomesDosTimes(current, draft);
  // Sem times sorteados e sem jogo, a coluna da esquerda ficaria vazia: a
  // página volta a ser uma coluna só.
  const temEsquerda = draft !== null || current.matches.some((match) => match.stats.length > 0);

  return (
    <div className="space-y-6">
      {/* ---------------- placar ---------------- */}
      <Card
        title={
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
            <Swords size={16} />
            {current.name ?? 'MD3 em andamento'}
          </h2>
        }
        action={
          <Button
            variant="ghost"
            onClick={async () => {
              await finishSeries.run(current.id);
              clearActiveDraft();
              setDraft(null);
              series.reload();
            }}
            loading={finishSeries.loading}
          >
            <FlagTriangleRight size={14} />
            Encerrar
          </Button>
        }
      >
        {/* Placar por ELENCO: blueScore/redScore são o time A e o time B (ver
            ARCHITECTURE). Os rótulos diziam "Azul x Vermelho", e depois da
            troca de lado no jogo 2 o azul da tela não era mais o azul do jogo. */}
        <div className="flex items-start justify-center gap-6 py-2">
          <ScoreBlock label="Time A" score={current.blueScore} nomes={nomes.A} />
          <span className="pt-2 text-ink-faint">x</span>
          <ScoreBlock label="Time B" score={current.redScore} nomes={nomes.B} />
        </div>

        <p className="text-center text-xs text-ink-faint">
          {current.matches.length === 0
            ? 'Nenhum jogo registrado. O jogo 1 libera todos os campeões.'
            : `Próximo: jogo ${nextMatchNumber} · Fearless ${current.fearless ? 'ligado' : 'desligado'}`}
        </p>

        {!registering && nextMatchNumber <= 3 && (
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setRegistering(true)}>
              <ClipboardList size={16} />
              Registrar jogo {nextMatchNumber}
            </Button>
          </div>
        )}
      </Card>

      {/* ---------------- formulario de registro ---------------- */}
      {registering && players.data && (
        <MatchForm
          seriesId={current.id}
          players={players.data}
          burned={current.burnedChampions}
          prefill={prefill}
          onSaved={() => {
            setRegistering(false);
            series.reload();
          }}
          onCancel={() => setRegistering(false)}
        />
      )}

      {/* Duas colunas no desktop: à esquerda o que se lê entre um jogo e outro
          (os times e a MD3 até agora), à direita o que se consulta e se faz
          (jogos, queimados, importação). Empilhado, cada card esticava pela
          largura inteira com metade vazia. */}
      <div
        className={
          temEsquerda
            ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'
            : 'space-y-6'
        }
      >
        <div className="min-w-0 space-y-6">
          {/* ---------------- times sorteados ---------------- */}
          {draft && (
            <Card
              title="Times sorteados"
              action={
                <button
                  onClick={() => {
                    clearActiveDraft();
                    setDraft(null);
                  }}
                  className="flex items-center gap-1 text-xs text-ink-faint hover:text-red"
                >
                  <Trash2 size={12} />
                  descartar
                </button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {(['BLUE', 'RED'] as TeamSide[]).map((side) => (
                  <div key={side}>
                    <p
                      className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${
                        side === 'BLUE' ? 'text-blue' : 'text-red'
                      }`}
                    >
                      {side === 'BLUE' ? 'Azul' : 'Vermelho'}
                    </p>
                    <ul className="space-y-1 text-xs">
                      {ROLES.map((role) => {
                        const slot = draft.slots.find(
                          (s) => s.teamSide === side && s.rolePlayed === role
                        );
                        return (
                          <li key={role} className="flex items-center gap-2">
                            <RoleBadge role={role} />
                            <span className="truncate">{slot?.playerName ?? '--'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-ink-faint">
                Esses times ja preenchem o formulario de registro. Seed {draft.seed}.
              </p>
            </Card>
          )}

          <NaSerie serie={current} rotulo="A MD3 até agora" />
        </div>

        <div className="min-w-0 space-y-6">
          {/* ---------------- jogos ja registrados ---------------- */}
          <Card title={`Jogos da série (${current.matches.length})`}>
            {current.matches.length === 0 ? (
              <EmptyState label="Nada registrado ainda." />
            ) : (
              <ul className="space-y-2">
                {current.matches.map((match) => {
                  // Quem venceu pelo ELENCO, como o placar: "azul venceu" no
                  // jogo 2 pode ser o time B, que trocou de lado. O ponto diz
                  // de que lado o vencedor jogou naquele jogo.
                  const venceuA = match.winner === ladoDoTimeA(match.stats, elencoA);
                  const ladoDoVencedor = match.winner === 'BLUE' ? 'azul' : 'vermelho';
                  return (
                    <li
                      key={match.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line/50 bg-raised/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">Jogo {match.matchNumber}</span>
                      {match.winner ? (
                        <span
                          className="flex items-center gap-1.5"
                          title={`Jogou de ${ladoDoVencedor}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              match.winner === 'BLUE' ? 'bg-blue' : 'bg-red'
                            }`}
                          />
                          Time {venceuA ? 'A' : 'B'} venceu
                          <span className="sr-only">, de {ladoDoVencedor}</span>
                        </span>
                      ) : (
                        <span className="text-ink-faint">sem resultado</span>
                      )}
                      <span className="text-xs text-ink-faint">
                        {match.gameDurationSec
                          ? `${Math.round(match.gameDurationSec / 60)} min`
                          : 'duração n/d'}
                        {/* Qualquer origem que não seja digitada na mão é "auto".
                            Comparar com 'RIOT_API' funcionava só porque o ingest
                            carimbava esse rótulo em tudo; agora que a coluna guarda
                            LCU e ROFL de verdade, a pergunta certa é o contrário. */}
                        {match.source !== 'MANUAL' && ' · auto'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---------------- Fearless ---------------- */}
          <BurnedChampions burned={current.burnedChampions} ddragonVersion={manifest?.version} />

          {/* ---------------- importacao automatica ---------------- */}
          <Card
            title={
              <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
                <Terminal size={16} />
                Importar do cliente do LoL
              </h2>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-ink-faint">
              A API pública da Riot <strong className="text-ink">não lista custom games</strong>.
              Quem lista é o próprio cliente do LoL. Rode o agente na máquina de quem hospedou a
              partida e ele manda o placar completo para cá:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-line/60 bg-canvas p-3 text-[11px] text-emerald-300">
              node companion/inhouse-companion.mjs --watch
            </pre>
            <p className="mt-2 text-[11px] text-ink-faint">
              Com <code className="text-gold">--watch</code> ele envia sozinho no fim de cada jogo.
              Use <code className="text-gold">--last</code> para mandar só a última partida.
            </p>

            <div className="mt-4 border-t border-line/40 pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
                Ou cole o Match ID manualmente
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={matchIdInput}
                  onChange={(event) => setMatchIdInput(event.target.value)}
                  placeholder="BR1_1234567890"
                  className="min-w-[200px] flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm placeholder:text-ink-faint focus:border-gold focus:outline-none"
                />
                <Button
                  onClick={async () => {
                    if (await importMatch.run(matchIdInput.trim(), current.id, {})) {
                      setMatchIdInput('');
                      series.reload();
                    }
                  }}
                  disabled={matchIdInput.trim().length < 3}
                  loading={importMatch.loading}
                >
                  <Download size={16} />
                  Importar
                </Button>
              </div>
              {importMatch.error && (
                <div className="mt-3">
                  <ErrorState error={importMatch.error} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Um lado do placar: o número, "Time A/B" e quem é o time -- sem cor de lado,
 * porque o time A não fica no azul a MD3 inteira.
 */
function ScoreBlock({ label, score, nomes }: { label: string; score: number; nomes: string[] }) {
  return (
    <div className="min-w-0 max-w-[11rem] text-center">
      <p className="tabular text-4xl font-bold text-ink">{score}</p>
      <p className="text-[11px] uppercase tracking-widest text-ink-faint">{label}</p>
      {nomes.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-ink-muted">{nomes.join(' · ')}</p>
      )}
    </div>
  );
}

/**
 * Quem é o time A e o B: o elenco do jogo 1 (azul = A, a regra do placar) ou,
 * antes do primeiro jogo, os times sorteados. Sem nenhum dos dois, ninguém.
 */
function nomesDosTimes(
  serie: SeriesDetail,
  draft: ReturnType<typeof loadActiveDraft>
): Record<'A' | 'B', string[]> {
  const ordem = (role: Role) => ROLES.indexOf(role);
  const primeira = serie.matches
    .filter((match) => match.stats.length > 0)
    .sort((a, b) => a.matchNumber - b.matchNumber)[0];

  if (primeira) {
    const doLado = (lado: TeamSide) =>
      primeira.stats
        .filter((stat) => stat.teamSide === lado)
        .sort((a, b) => ordem(a.rolePlayed) - ordem(b.rolePlayed))
        .map((stat) => stat.player.name);
    return { A: doLado('BLUE'), B: doLado('RED') };
  }
  if (draft) {
    const doLado = (lado: TeamSide) =>
      draft.slots
        .filter((slot) => slot.teamSide === lado)
        .sort((a, b) => ordem(a.rolePlayed) - ordem(b.rolePlayed))
        .map((slot) => slot.playerName);
    return { A: doLado('BLUE'), B: doLado('RED') };
  }
  return { A: [], B: [] };
}
