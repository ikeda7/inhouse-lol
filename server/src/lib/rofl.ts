/**
 * =============================================================================
 * .ROFL  --  arquivos de replay do League of Legends
 * =============================================================================
 *
 * POR QUE EXISTE: o historico do cliente (LCU) cobre cerca de 100 partidas, o
 * equivalente a mais ou menos um mes. Resolve quase tudo, mas nao o que for
 * mais antigo que isso.
 *
 * O replay, quando salvo, guarda o scoreboard completo para SEMPRE. E a unica
 * forma de importar partida fora daquela janela -- e funciona com o jogo
 * fechado, ja que le arquivo em disco em vez de falar com o cliente.
 *
 * FORMATO (verificado em arquivo real, magic "RIOT\x02\x00"):
 * Os offsets do header classico (metadataOffset em 268, etc.) NAO valem mais
 * nessa versao -- devolvem lixo. O que continua verdadeiro e que existe um
 * bloco JSON em texto claro perto do FIM do arquivo, com a forma:
 *
 *   { "gameLength": 1501000, "lastGameChunkId": .., "lastKeyFrameId": ..,
 *     "statsJson": "[{...10 jogadores...}]" }
 *
 * Entao localizamos esse bloco por varredura em vez de confiar em offset fixo.
 * E mais robusto: sobrevive a mudanca de header entre patches.
 *
 * PECULIARIDADES do statsJson:
 *   - TODO valor e string: "5" e nao 5, "Win" e nao true;
 *   - o campo do campeao e `SKIN` (nome, nao id numerico);
 *   - `TEAM` e "100"/"200" como string;
 *   - `TEAM_POSITION` costuma vir VAZIO em custom game (e
 *     `INDIVIDUAL_POSITION` vem "Invalid"), entao a posicao e resolvida pelo
 *     pool declarado, igual ao caminho do LCU;
 *   - replays antigos nao tem `RIOT_ID_GAME_NAME`, so `NAME` (nome de invocador
 *     legado) -- por isso o casamento e feito por PUUID em primeiro lugar.
 */

import type { LcuGame, LcuParticipant, LcuParticipantIdentity } from './lcu.js';
import { LcuError } from './lcu.js';

/** Uma linha do statsJson. Todos os valores chegam como string. */
export type RoflPlayerStats = Record<string, string | number>;

export interface RoflMetadata {
  gameLength?: number;
  statsJson?: string;
  [key: string]: unknown;
}

/** Converte "1234" -> 1234, tolerando vazio e lixo. */
function num(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: string | number | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Extrai o bloco JSON de metadados de um .rofl.
 *
 * Varre atras de `"statsJson"`, recua ate a `{` que abre o objeto e avanca
 * equilibrando chaves -- ignorando as que aparecem dentro de string, senao o
 * proprio statsJson (que e uma string cheia de `{`) quebraria a contagem.
 */
export function extractRoflMetadata(buffer: Buffer): RoflMetadata {
  const anchor = buffer.indexOf(Buffer.from('"statsJson"', 'utf8'));
  if (anchor < 0) {
    throw new LcuError(
      'Esse .rofl nao tem o bloco de estatisticas em texto claro. ' +
        'Replays de partidas muito antigas ou de outra regiao podem nao conter os dados.',
      'ROFL_NO_STATS'
    );
  }

  let start = anchor;
  while (start > 0 && buffer[start] !== 0x7b /* { */) start--;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;

  for (let i = start; i < buffer.length; i++) {
    const byte = buffer[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (byte === 0x5c /* \ */) {
      escaped = true;
      continue;
    }
    if (byte === 0x22 /* " */) {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (byte === 0x7b) depth++;
    else if (byte === 0x7d /* } */) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw new LcuError('Bloco de metadados do .rofl esta truncado.', 'ROFL_TRUNCATED');
  }

  try {
    return JSON.parse(buffer.subarray(start, end).toString('utf8')) as RoflMetadata;
  } catch {
    throw new LcuError('Nao consegui ler os metadados do .rofl.', 'ROFL_PARSE_ERROR');
  }
}

export interface RoflSource {
  /** Ex: "BR1", tirado do nome do arquivo. */
  platformId: string;
  /** Ex: 3019927113, tirado do nome do arquivo. */
  gameId: number;
  /** Epoch ms. O .rofl nao guarda a data; usamos o mtime do arquivo. */
  playedAtMs?: number;
}

/**
 * Converte o statsJson do replay para o mesmo shape que o LCU entrega.
 *
 * Assim o `mapLcuGame` -- que ja e testado e ja resolve posicao ambigua pelo
 * pool declarado -- serve os dois caminhos, sem duplicar regra.
 */
export function roflToLcuGame(metadata: RoflMetadata, source: RoflSource): LcuGame {
  if (!metadata.statsJson) {
    throw new LcuError('O .rofl nao contem statsJson.', 'ROFL_NO_STATS');
  }

  let stats: RoflPlayerStats[];
  try {
    stats = JSON.parse(metadata.statsJson) as RoflPlayerStats[];
  } catch {
    throw new LcuError('statsJson do .rofl esta corrompido.', 'ROFL_PARSE_ERROR');
  }

  if (!Array.isArray(stats) || stats.length !== 10) {
    throw new LcuError(
      `O replay tem ${Array.isArray(stats) ? stats.length : 0} jogadores; esperava 10.`,
      'INVALID_PARTICIPANT_COUNT'
    );
  }

  const participants: LcuParticipant[] = stats.map((player, index) => ({
    participantId: index + 1,
    // O replay nao traz championId numerico, so o nome em SKIN. O servidor
    // resolve o id depois pelo Data Dragon.
    championId: 0,
    championName: str(player.SKIN),
    teamId: num(player.TEAM) === 200 ? 200 : 100,
    timeline: {
      lane: str(player.TEAM_POSITION) || str(player.INDIVIDUAL_POSITION),
      role: '',
    },
    stats: {
      kills: num(player.CHAMPIONS_KILLED),
      deaths: num(player.NUM_DEATHS),
      assists: num(player.ASSISTS),
      totalDamageDealtToChampions: num(player.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
      totalDamageTaken: num(player.TOTAL_DAMAGE_TAKEN),
      goldEarned: num(player.GOLD_EARNED),
      visionScore: num(player.VISION_SCORE),
      totalMinionsKilled: num(player.MINIONS_KILLED),
      neutralMinionsKilled: num(player.NEUTRAL_MINIONS_KILLED),
    },
  }));

  const identities: LcuParticipantIdentity[] = stats.map((player, index) => {
    const gameName = str(player.RIOT_ID_GAME_NAME);
    const tagLine = str(player.RIOT_ID_TAG_LINE);
    return {
      participantId: index + 1,
      player: {
        puuid: str(player.PUUID) || undefined,
        // Replays antigos so tem NAME (nome de invocador legado).
        gameName: gameName || undefined,
        tagLine: tagLine || undefined,
        summonerName: str(player.NAME) || undefined,
      },
    };
  });

  const blueWon = str(stats[0].WIN) === 'Win' ? num(stats[0].TEAM) === 100 : num(stats[0].TEAM) === 200;

  return {
    gameId: source.gameId,
    platformId: source.platformId,
    gameCreation: source.playedAtMs ?? Date.now(),
    gameDuration: Math.round((metadata.gameLength ?? 0) / 1000),
    // O replay nao registra o tipo de fila. Como so importamos replay a pedido
    // explicito do usuario, tratamos como custom -- e o caso de uso do app.
    gameType: 'CUSTOM_GAME',
    queueId: 0,
    participants,
    participantIdentities: identities,
    teams: [
      { teamId: 100, win: blueWon ? 'Win' : 'Fail' },
      { teamId: 200, win: blueWon ? 'Fail' : 'Win' },
    ],
  };
}

/** "BR1-3019927113.rofl" -> { platformId: "BR1", gameId: 3019927113 } */
export function parseRoflFilename(filename: string): RoflSource | null {
  const match = filename.match(/^([A-Z0-9]+)[-_](\d+)\.rofl$/i);
  if (!match) return null;
  return { platformId: match[1].toUpperCase(), gameId: Number(match[2]) };
}
