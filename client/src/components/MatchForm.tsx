import { useMemo, useState } from 'react';
import { Save, Trophy } from 'lucide-react';
import { seriesApi, type RecordMatchPlayer } from '../api/client';
import { useAction } from '../hooks/useAsync';
import { Button, Card, ErrorState, RoleBadge } from './ui';
import { ChampionPicker } from './ChampionPicker';
import { Select } from './Select';
import {
  ROLES,
  ROLE_LABEL,
  type BurnedChampion,
  type Player,
  type Role,
  type TeamSide,
} from '../types';

/** Uma linha do scoreboard em edicao. */
interface RowState {
  playerId: string;
  teamSide: TeamSide;
  rolePlayed: Role;
  championName: string;
  championId: number | null;
  kills: string;
  deaths: string;
  assists: string;
  damage: string;
  visionScore: string;
  cs: string;
}

export interface PrefilledSlot {
  playerId: string;
  teamSide: TeamSide;
  rolePlayed: Role;
}

interface MatchFormProps {
  seriesId: string;
  players: Player[];
  burned: BurnedChampion[];
  /** Times ja sorteados: preenche os 10 lugares e as roles. */
  prefill?: PrefilledSlot[];
  onSaved: () => void;
  onCancel?: () => void;
}

function buildInitialRows(prefill?: PrefilledSlot[]): RowState[] {
  const blank = (teamSide: TeamSide, rolePlayed: Role): RowState => ({
    playerId: '',
    teamSide,
    rolePlayed,
    championName: '',
    championId: null,
    kills: '',
    deaths: '',
    assists: '',
    damage: '',
    visionScore: '',
    cs: '',
  });

  const rows: RowState[] = [];
  for (const side of ['BLUE', 'RED'] as TeamSide[]) {
    for (const role of ROLES) {
      const slot = prefill?.find((s) => s.teamSide === side && s.rolePlayed === role);
      rows.push({ ...blank(side, role), playerId: slot?.playerId ?? '' });
    }
  }
  return rows;
}

/**
 * REGISTRO MANUAL DE PARTIDA
 *
 * Nao e um "plano B para quando a API falha": a API publica da Riot nao lista
 * custom games, entao este formulario e um caminho de primeira classe.
 *
 * Decisoes de UI que vieram do uso real (registrar 10 linhas as 2h da manha):
 *  - As 10 posicoes ja vem fixas (5 azuis + 5 vermelhas, uma por role). Nao da
 *    para montar um time invalido, porque nao existe onde errar.
 *  - Se veio de um sorteio, os jogadores ja chegam preenchidos: sobra digitar
 *    campeao e KDA.
 *  - Dano/visao/CS sao OPCIONAIS. Exigir os 10 numeros de todo mundo garantiria
 *    que ninguem preenche. Vazio vira 0 e o KDA continua valendo.
 *  - Os campeoes queimados aparecem bloqueados no picker, entao a regra do
 *    Fearless e visivel ANTES de tentar salvar.
 */
export function MatchForm({
  seriesId,
  players,
  burned,
  prefill,
  onSaved,
  onCancel,
}: MatchFormProps) {
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(prefill));
  const [winner, setWinner] = useState<TeamSide | null>(null);
  const [durationMin, setDurationMin] = useState('');

  const save = useAction(seriesApi.recordMatch);

  const burnedSet = useMemo(
    () => new Set(burned.map((champion) => champion.championName.toLowerCase())),
    [burned]
  );
  const takenSet = useMemo(
    () =>
      new Set(rows.map((row) => row.championName.toLowerCase()).filter((name) => name.length > 0)),
    [rows]
  );

  const usedPlayerIds = useMemo(
    () => new Set(rows.map((row) => row.playerId).filter(Boolean)),
    [rows]
  );

  const update = (index: number, patch: Partial<RowState>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const missingPlayers = rows.filter((row) => !row.playerId).length;
  const missingChampions = rows.filter((row) => !row.championName.trim()).length;
  const canSave = missingPlayers === 0 && missingChampions === 0 && winner !== null;

  const handleSave = async () => {
    if (!canSave || !winner) return;

    const toNumber = (value: string) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    };

    const payload: RecordMatchPlayer[] = rows.map((row) => ({
      playerId: row.playerId,
      teamSide: row.teamSide,
      rolePlayed: row.rolePlayed,
      championName: row.championName.trim(),
      championId: row.championId,
      kills: toNumber(row.kills),
      deaths: toNumber(row.deaths),
      assists: toNumber(row.assists),
      damage: toNumber(row.damage),
      visionScore: toNumber(row.visionScore),
      cs: toNumber(row.cs),
    }));

    const minutes = Number.parseInt(durationMin, 10);
    const result = await save.run(seriesId, {
      winner,
      players: payload,
      ...(Number.isFinite(minutes) && minutes > 0 ? { gameDurationSec: minutes * 60 } : {}),
    });

    if (result) onSaved();
  };

  return (
    <Card title="Registrar partida">
      {/* --- vencedor: primeira decisao, porque tinge o resto do formulario --- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Quem venceu?
        </span>
        {(['BLUE', 'RED'] as TeamSide[]).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setWinner(side)}
            aria-pressed={winner === side}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase transition ${
              winner === side
                ? side === 'BLUE'
                  ? 'border-blue bg-blue/25 text-blue'
                  : 'border-red bg-red/25 text-red'
                : 'border-line text-ink-faint hover:border-gold/50'
            }`}
          >
            <Trophy size={13} />
            {side === 'BLUE' ? 'Azul' : 'Vermelho'}
          </button>
        ))}

        <label className="ml-auto text-xs text-ink-faint">
          Duração (min)
          <input
            value={durationMin}
            onChange={(event) => setDurationMin(event.target.value.replace(/\D/g, ''))}
            placeholder="30"
            inputMode="numeric"
            className="ml-2 w-16 rounded border border-line bg-raised px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
          />
        </label>
      </div>

      <div className="space-y-4">
        {(['BLUE', 'RED'] as TeamSide[]).map((side) => (
          <div key={side}>
            <p
              className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${
                side === 'BLUE' ? 'text-blue' : 'text-red'
              }`}
            >
              Time {side === 'BLUE' ? 'Azul' : 'Vermelho'}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="w-20 font-medium">Role</th>
                    <th className="w-40 font-medium">Jogador</th>
                    <th className="w-48 font-medium">Campeão</th>
                    <th className="w-14 font-medium">K</th>
                    <th className="w-14 font-medium">D</th>
                    <th className="w-14 font-medium">A</th>
                    <th className="w-20 font-medium">Dano</th>
                    <th className="w-16 font-medium">Visao</th>
                    <th className="w-16 font-medium">CS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    if (row.teamSide !== side) return null;
                    return (
                      <tr key={`${row.teamSide}-${row.rolePlayed}`}>
                        <td className="pr-2">
                          <RoleBadge role={row.rolePlayed} />
                        </td>

                        <td className="pr-2">
                          <Select
                            value={row.playerId}
                            onChange={(playerId) => update(index, { playerId })}
                            invalid={!row.playerId}
                            ariaLabel={`Jogador de ${ROLE_LABEL[row.rolePlayed]} do time ${side === 'BLUE' ? 'azul' : 'vermelho'}`}
                            options={players.map((player) => ({
                              value: player.id,
                              label: player.name,
                              // Bloqueia escalar a mesma pessoa duas vezes --
                              // continua visível, com o motivo à mostra.
                              disabled: usedPlayerIds.has(player.id) && player.id !== row.playerId,
                              hint:
                                usedPlayerIds.has(player.id) && player.id !== row.playerId
                                  ? 'escalado'
                                  : undefined,
                            }))}
                          />
                        </td>

                        <td className="pr-2">
                          <ChampionPicker
                            value={row.championName}
                            burned={burnedSet}
                            taken={takenSet}
                            onChange={(championName, championId) =>
                              update(index, { championName, championId })
                            }
                          />
                        </td>

                        {(
                          ['kills', 'deaths', 'assists', 'damage', 'visionScore', 'cs'] as const
                        ).map((field) => (
                          <td key={field} className="pr-2">
                            <input
                              value={row[field]}
                              onChange={(event) =>
                                update(index, {
                                  [field]: event.target.value.replace(/\D/g, ''),
                                } as Partial<RowState>)
                              }
                              inputMode="numeric"
                              placeholder="0"
                              aria-label={`${field} de ${ROLE_LABEL[row.rolePlayed]} ${side}`}
                              className="w-full rounded border border-line bg-raised px-1.5 py-1.5 text-center text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={!canSave} loading={save.loading}>
          <Save size={16} />
          Salvar partida
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}

        {/* Diz o que exatamente falta, em vez de so desabilitar o botao. */}
        {!canSave && (
          <span className="text-xs text-amber-400/80">
            {[
              winner === null && 'escolha o vencedor',
              missingPlayers > 0 && `${missingPlayers} jogador(es) sem selecionar`,
              missingChampions > 0 &&
                `${missingChampions} ${missingChampions === 1 ? 'campeão faltando' : 'campeões faltando'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {save.error && (
        <div className="mt-3">
          <ErrorState error={save.error} />
        </div>
      )}
    </Card>
  );
}
