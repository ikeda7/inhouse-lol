/**
 * Sorteio de times e escolha de capitães: o que as rotas de draft calculam
 * antes de responder.
 *
 * Mora aqui, e não em `routes/draft.ts`, porque é regra de negócio: a força
 * de cada um (histórico + ajuste manual do cadastro) e quem vira capitão. O
 * modo Capitães normal e a sala ao vivo começam do mesmo jeito, e com isso
 * escrito duas vezes na rota a próxima mudança entraria num e não no outro.
 */

import { autoBalanceTeams, DraftError, NEUTRAL_RATING } from '../lib/autoBalance.js';
import { historicoConsiderado, ratingPorHistorico } from '../lib/forca.js';
import {
  selectCaptains,
  startCaptainsDraft,
  type CaptainCandidate,
  type CaptainSelectionMode,
  type CaptainsDraftState,
} from '../lib/captainsDraft.js';
import { findPlayersByIds, toDraftablePlayer } from './players.js';
import { getLastGameLosers } from './series.js';
import { getHistoricoDoSorteio, getWinRates } from './stats.js';

/**
 * Carrega os 10 jogadores e garante que todos os ids existem -- senão o draft
 * rodaria com 9 e daria um erro confuso lá na frente.
 */
async function carregarElenco(playerIds: string[]) {
  const players = await findPlayersByIds(playerIds);
  if (players.length !== playerIds.length) {
    const found = new Set(players.map((p) => p.id));
    const missing = playerIds.filter((id) => !found.has(id));
    throw new DraftError(
      `Jogador(es) não encontrado(s): ${missing.join(', ')}.`,
      'PLAYER_NOT_FOUND',
      { missing }
    );
  }
  return players;
}

export interface OpcoesDoSorteio {
  playerIds: string[];
  /** Repassar a seed de um sorteio anterior reproduz exatamente o mesmo resultado. */
  seed?: number;
  /** Ignora o rating e busca só o melhor encaixe de roles. */
  ignoreRating?: boolean;
  /** Divisões que já apareceram na tela ("tenta outro"): os ids de um dos times. */
  evitar?: string[][];
}

/** O botão "Sortear Times". */
export async function sortearTimes({ playerIds, seed, ignoreRating, evitar }: OpcoesDoSorteio) {
  const [roster, { kdaDoGrupo, porJogador }] = await Promise.all([
    carregarElenco(playerIds),
    getHistoricoDoSorteio(),
  ]);

  // Força pelo histórico (lib/forca). O internalRating do cadastro vira um
  // ajuste manual por cima -- 1000 é "sem ajuste" -- para ainda dar para
  // dizer "o novato é bom" antes de ele ter jogo aqui.
  const result = autoBalanceTeams(
    roster.map((player) => ({
      ...toDraftablePlayer(player),
      rating:
        ratingPorHistorico(porJogador.get(player.id), kdaDoGrupo) +
        (player.internalRating - NEUTRAL_RATING),
    })),
    { seed, avoidSplits: evitar, ...(ignoreRating ? { ratingWeight: 0 } : {}) }
  );

  // O histórico de cada um volta junto: o KDA do ranking para cada linha, e o
  // que o sorteio considerou para a média do time -- é assim que o grupo
  // confere se ficou parelho sem um KDA absurdo distorcer a média.
  const historico = Object.fromEntries(
    playerIds.map((id) => {
      const doJogador = porJogador.get(id);
      const considerado = historicoConsiderado(doJogador, kdaDoGrupo);
      return [
        id,
        {
          jogos: doJogador?.jogos ?? 0,
          kda: doJogador?.kda ?? 0,
          winRate: doJogador?.winRate ?? 0,
          kdaConsiderado: Math.round(considerado.kda * 100) / 100,
          winRateConsiderado: Math.round(considerado.vitorias * 1000) / 10,
        },
      ];
    })
  );

  return { ...result, historico };
}

export interface OpcoesDosCapitaes {
  playerIds: string[];
  mode: CaptainSelectionMode;
  /** Necessário no modo LAST_LOSERS: de qual MD3 pegar quem perdeu o último mapa. */
  seriesId?: string;
  seed?: number;
  /** Necessário no modo MANUAL: [capitão azul, capitão vermelho]. */
  captainIds?: [string, string];
}

/**
 * Escolhe os capitães e devolve o estado inicial do draft. É o começo comum
 * do modo Capitães (estado no cliente) e da sala ao vivo (estado no banco).
 */
export async function iniciarDraftDeCapitaes({
  playerIds,
  mode,
  seriesId,
  seed,
  captainIds,
}: OpcoesDosCapitaes): Promise<CaptainsDraftState> {
  const roster = await carregarElenco(playerIds);
  const winRates = await getWinRates();

  const candidates: CaptainCandidate[] = roster.map((player) => {
    const stats = winRates.get(player.id);
    return {
      ...toDraftablePlayer(player),
      winRate: stats?.winRate ?? 0,
      gamesPlayed: stats?.games ?? 0,
    };
  });

  const lastGameLosers =
    mode === 'LAST_LOSERS' && seriesId ? await getLastGameLosers(seriesId) : [];

  const captains = selectCaptains({
    roster: candidates,
    mode,
    lastGameLosers,
    seed,
    captainIds,
  });
  return startCaptainsDraft(candidates, captains);
}
