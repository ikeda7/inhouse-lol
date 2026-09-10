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
import { ROLES, type TeamSide } from '../types';

/**
 * A "noite de jogos": a MD3 em andamento.
 *
 * Concentra o que se usa AO VIVO -- placar, queimados do Fearless, os times
 * sorteados e o registro do jogo que acabou. Estatistica historica fica no
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
        <div className="flex items-center justify-center gap-6 py-2">
          <ScoreBlock label="Azul" score={current.blueScore} side="BLUE" />
          <span className="text-ink-faint">x</span>
          <ScoreBlock label="Vermelho" score={current.redScore} side="RED" />
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
          A API pública da Riot <strong className="text-ink">não lista custom games</strong>. Quem
          lista é o próprio cliente do LoL. Rode o agente na máquina de quem hospedou a partida e
          ele manda o placar completo para cá:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-line/60 bg-canvas p-3 text-[11px] text-emerald-300">
          node companion/inhouse-companion.mjs --watch
        </pre>
        <p className="mt-2 text-[11px] text-ink-faint">
          Com <code className="text-gold">--watch</code> ele envia sozinho no fim de cada jogo. Use{' '}
          <code className="text-gold">--last</code> para mandar só a última partida.
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

      {/* ---------------- jogos ja registrados ---------------- */}
      <Card title={`Jogos da série (${current.matches.length})`}>
        {current.matches.length === 0 ? (
          <EmptyState label="Nada registrado ainda." />
        ) : (
          <ul className="space-y-2">
            {current.matches.map((match) => (
              <li
                key={match.id}
                className="flex items-center justify-between rounded-lg border border-line/50 bg-raised/40 px-3 py-2 text-sm"
              >
                <span className="font-medium">Jogo {match.matchNumber}</span>
                <span className={match.winner === 'BLUE' ? 'text-blue' : 'text-red'}>
                  {match.winner === 'BLUE' ? 'Azul venceu' : 'Vermelho venceu'}
                </span>
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
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ScoreBlock({ label, score, side }: { label: string; score: number; side: TeamSide }) {
  return (
    <div className="text-center">
      <p className={`text-4xl font-bold ${side === 'BLUE' ? 'text-blue' : 'text-red'}`}>{score}</p>
      <p className="text-[11px] uppercase tracking-widest text-ink-faint">{label}</p>
    </div>
  );
}
