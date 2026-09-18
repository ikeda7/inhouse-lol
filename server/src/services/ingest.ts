import { prisma } from '../db/prisma.js';
import { mapLcuGame, type LcuGame, type LcuImportedParticipant } from '../lib/lcu.js';
import { getProfileIconUrl, resolveChampion } from '../lib/ddragon.js';
import type { ImportedMatch } from '../lib/riot.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';
import type { RoleInput, TeamSide } from '../lib/roles.js';
import {
  recordMatch,
  refreshMatchStats,
  SeriesError,
  type MatchBanInput,
  type MatchPlayerInput,
} from './series.js';

/**
 * A regra de importação de partida: casamento por PUUID, auto-vínculo, criação
 * de desconhecidos, ícone do LoL, idempotência e a MD3 de destino.
 *
 * Vivia dentro de `routes/ingest.ts`, misturada com o HTTP. A rota agora só
 * valida o corpo e responde; o que decide se a partida entra mora aqui, ao
 * lado de `series.ts`, que é quem grava.
 */

/**
 * Recusa da importação, com o motivo que o agente mostra para quem rodou.
 * O status vai junto porque o mesmo tipo de recusa (um conflito vindo de
 * `refreshMatchStats`) chega com códigos diferentes e sempre sai como 409.
 */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

export interface IngestOptions {
  seriesId?: string;
  matchNumber?: number;
  dryRun?: boolean;
  autoLink: boolean;
  autoCreatePlayers?: boolean;
  refreshStats?: boolean;
  /** De onde a partida veio. Vai para a resposta E para a coluna `source`. */
  source: 'LCU' | 'ROFL';
}

export interface IngestResult {
  /** true quando uma partida NOVA foi gravada (a rota responde 201). */
  criada: boolean;
  data: Record<string, unknown>;
}

/**
 * Resolve o nome dos campeoes banidos.
 *
 * O payload traz so o championId. Guardamos o nome junto porque o Data Dragon
 * muda de versao e um id que hoje resolve pode nao resolver depois -- e um ban
 * sem nome na tela nao serve para nada. Se o CDN estiver fora, entra sem nome
 * em vez de derrubar a importacao inteira por um dado decorativo.
 */
async function nomearBans(
  bans: { teamSide: TeamSide; championId: number; pickTurn: number }[]
): Promise<MatchBanInput[]> {
  return Promise.all(
    bans.map(async (ban) => {
      const asset = await resolveChampion(ban.championId).catch(() => null);
      return { ...ban, championName: asset?.name ?? null };
    })
  );
}

/**
 * Carrega o cadastro indexado por PUUID e por Riot ID (para o auto-vinculo).
 *
 * As contas extras (o smurf, `RiotAccount`) entram nos mesmos indices: para a
 * partida, jogar do main ou do smurf e a mesma pessoa. `contaId` diz em qual
 * linha gravar o PUUID quando ele chegar.
 */
async function loadKnownPlayers() {
  const players = await prisma.player.findMany({
    include: { roles: { orderBy: { priority: 'asc' } }, riotAccounts: true },
  });

  const byPuuid = new Map<string, DraftablePlayer>();
  const byRiotId = new Map<
    string,
    { id: string; name: string; puuid: string | null; contaId?: string }
  >();

  for (const player of players) {
    const draftable: DraftablePlayer = {
      id: player.id,
      name: player.name,
      roles: player.roles.map((entry) => entry.role as RoleInput),
      rating: player.internalRating,
    };
    if (player.puuid) byPuuid.set(player.puuid, draftable);
    if (player.riotId) {
      byRiotId.set(player.riotId.toLowerCase(), {
        id: player.id,
        name: player.name,
        puuid: player.puuid,
      });
    }
    for (const conta of player.riotAccounts) {
      if (conta.puuid) byPuuid.set(conta.puuid, draftable);
      if (conta.riotId) {
        byRiotId.set(conta.riotId.toLowerCase(), {
          id: player.id,
          name: player.name,
          puuid: conta.puuid,
          contaId: conta.id,
        });
      }
    }
  }

  return { players, byPuuid, byRiotId };
}

/**
 * Guarda o ícone de invocador de cada participante conhecido.
 *
 * O cliente do LoL manda o ícone junto com a partida, de graça -- sem chave da
 * Riot, que em produção não existe (a de desenvolvimento expira em 24h). Quem
 * ainda não tem foto, ou já usa o ícone, passa a aparecer com o ícone atual;
 * foto ENVIADA é escolha da pessoa e não é trocada.
 *
 * Falha aqui não derruba a importação: o ícone é enfeite, a partida não.
 */
async function guardarIcones(
  participantes: LcuImportedParticipant[],
  conhecidos: Map<string, DraftablePlayer>
): Promise<void> {
  for (const participante of participantes) {
    const jogador = participante.puuid ? conhecidos.get(participante.puuid) : undefined;
    const icone = participante.profileIconId;
    if (!jogador || !icone) continue;
    try {
      const photoUrl = await getProfileIconUrl(icone);
      await prisma.player.updateMany({
        where: { id: jogador.id, photoSource: { in: ['NONE', 'LOL_ICON'] } },
        data: { profileIconId: icone, photoUrl, photoSource: 'LOL_ICON' },
      });
      await prisma.player.updateMany({
        where: { id: jogador.id, photoSource: 'UPLOAD' },
        data: { profileIconId: icone },
      });
    } catch {
      // enfeite: sem Data Dragon, a pessoa fica sem ícone e a partida entra igual
    }
  }
}

/** Quem tem Riot ID cadastrado e ainda não tem PUUID ganha o PUUID de brinde. */
async function autoVincular(
  participantes: LcuImportedParticipant[],
  byPuuid: Map<string, DraftablePlayer>,
  byRiotId: Map<string, { id: string; name: string; puuid: string | null; contaId?: string }>
): Promise<string[]> {
  const linked: string[] = [];
  for (const participant of participantes) {
    if (!participant.puuid || byPuuid.has(participant.puuid)) continue;
    const candidate = participant.riotId
      ? byRiotId.get(participant.riotId.toLowerCase())
      : undefined;
    if (candidate && !candidate.puuid) {
      // O Riot ID batido pode ser o da conta principal ou o de uma conta extra:
      // o PUUID tem que cair na linha certa, senao o UNIQUE de Player.puuid
      // recusaria o segundo nick da mesma pessoa.
      if (candidate.contaId) {
        await prisma.riotAccount.update({
          where: { id: candidate.contaId },
          data: { puuid: participant.puuid },
        });
      } else {
        await prisma.player.update({
          where: { id: candidate.id },
          data: { puuid: participant.puuid },
        });
      }
      linked.push(candidate.name);
    }
  }
  return linked;
}

/** Cadastra quem não é conhecido, com o nick do Riot ID como nome provisório. */
async function criarDesconhecidos(
  participantes: LcuImportedParticipant[],
  byPuuid: Map<string, DraftablePlayer>
): Promise<string[]> {
  const created: string[] = [];
  for (const participant of participantes) {
    if (!participant.puuid || byPuuid.has(participant.puuid)) continue;

    // Nome provisorio = nick do Riot ID. Fica obvio na tela que precisa
    // renomear, e a unicidade vem do proprio nick.
    const nome =
      participant.riotId?.split('#')[0]?.trim() ||
      participant.summonerName?.trim() ||
      `Jogador ${participant.puuid.slice(0, 6)}`;

    const jaExiste = await prisma.player.findFirst({
      where: { OR: [{ name: nome }, { puuid: participant.puuid }] },
      select: { id: true },
    });
    if (jaExiste) {
      // Nome batido mas PUUID novo: liga os dois em vez de duplicar a pessoa.
      await prisma.player.update({
        where: { id: jaExiste.id },
        data: { puuid: participant.puuid },
      });
      continue;
    }

    await prisma.player.create({
      data: {
        name: nome,
        riotId: participant.riotId,
        puuid: participant.puuid,
        // Sem saber o pool real, FILL e o palpite honesto: nao inventa
        // preferencia que a pessoa nunca declarou.
        roles: { create: [{ role: 'FILL', priority: 0 }] },
      },
    });
    created.push(nome);
  }
  return created;
}

/**
 * Fluxo unico de ingestao. Recebe o jogo ja no shape do LCU, venha ele do
 * cliente ou de um replay.
 */
export async function ingestGame(game: LcuGame, options: IngestOptions): Promise<IngestResult> {
  const { byPuuid, byRiotId } = await loadKnownPlayers();
  const imported = mapLcuGame(game, byPuuid);

  if (!imported.isCustomGame) {
    throw new IngestError(
      'Essa partida não é um custom game. O InHouse só registra os amistosos do grupo.',
      'NOT_A_CUSTOM_GAME',
      400
    );
  }

  const linked = options.autoLink
    ? await autoVincular(imported.participants, byPuuid, byRiotId)
    : [];

  // Recarrega ANTES de criar desconhecidos: quem acabou de ser vinculado ainda
  // nao esta no mapa em memoria, e seria cadastrado de novo -- a mesma pessoa
  // duas vezes no ranking, que e justamente o que a conta extra evita.
  const aposVinculo = linked.length > 0 ? (await loadKnownPlayers()).byPuuid : byPuuid;

  const created = options.autoCreatePlayers
    ? await criarDesconhecidos(imported.participants, aposVinculo)
    : [];

  // Recarrega se algo mudou, para o casamento abaixo enxergar os novos vinculos.
  const known = created.length > 0 ? (await loadKnownPlayers()).byPuuid : aposVinculo;

  const matched: MatchPlayerInput[] = [];
  const unmatched: {
    riotId: string | null;
    summonerName: string | null;
    championName: string | null;
  }[] = [];

  for (const participant of imported.participants) {
    const player = participant.puuid ? known.get(participant.puuid) : undefined;

    // O .rofl traz o NOME do campeao; o LCU traz o id numerico. resolveChampion
    // aceita os dois, entao passamos o que a origem tiver.
    const championKey = participant.championName || participant.championId;
    const champion = await resolveChampion(championKey).catch(() => null);

    if (!player) {
      unmatched.push({
        riotId: participant.riotId,
        summonerName: participant.summonerName,
        championName: champion?.name ?? participant.championName,
      });
      continue;
    }

    // Espalhar em vez de listar campo por campo: os nomes de LcuImportedParticipant
    // e MatchPlayerInput sao os mesmos de proposito, e com 40+ colunas de
    // scoreboard uma lista manual esquece uma e grava zero sem avisar. Só o que
    // muda de verdade vem sobrescrito abaixo -- e o TypeScript reclama se um
    // campo obrigatorio faltar.
    const { puuid, riotId, summonerName, win, profileIconId, ...scoreboard } = participant;

    matched.push({
      ...scoreboard,
      playerId: player.id,
      // Sem o Data Dragon, guarda o que tiver para nao perder o dado.
      championName:
        champion?.name ?? participant.championName ?? `champion:${participant.championId}`,
      // O replay nao traz id numerico (championId = 0); o Data Dragon devolve.
      championId: champion?.key ?? participant.championId ?? null,
    });
  }

  if (unmatched.length > 0) {
    // Gravar 8 de 10 corromperia o leaderboard em silencio. Melhor recusar e
    // dizer exatamente quem falta vincular.
    throw new IngestError(
      `${unmatched.length} participante(s) não estão vinculados a nenhum jogador cadastrado.` +
        ` Se não souber de quem são, importe com autoCreatePlayers para cadastrá-los com o nick e renomear depois.`,
      'UNMATCHED_PARTICIPANTS',
      409,
      { unmatched, autoLinked: linked }
    );
  }

  // Antes de decidir entre gravar, atualizar ou avisar que já existe: um
  // reenvio (--refresh-all) também traz o ícone, e é assim que as partidas
  // antigas preenchem a foto de quem ainda não tem.
  if (!options.dryRun) await guardarIcones(imported.participants, known);

  // --- idempotencia: o agente pode reenviar o mesmo jogo sem duplicar ---
  //
  // Esta checagem vem ANTES de procurar a serie de destino de proposito: uma
  // partida que ja existe pertence a uma serie, e exigir uma MD3 aberta para
  // atualizar a scoreboard dela nao faz sentido nenhum. Na ordem contraria, o
  // --refresh-all falhava em todas as partidas fora de uma noite de jogos.
  const already = await prisma.match.findUnique({
    where: { riotMatchId: imported.riotMatchId },
    select: { id: true, matchNumber: true, seriesId: true },
  });
  if (already) {
    // Reenviar o mesmo jogo com refreshStats atualiza a scoreboard no lugar --
    // caminho para preencher colunas novas (destaques) e corrigir roles sem
    // apagar a partida e perder placar da MD3 e campeoes queimados.
    if (options.refreshStats && !options.dryRun) {
      try {
        const { updated, teams, bans } = await refreshMatchStats(
          already.id,
          imported.winner,
          matched,
          {
            teams: imported.teams,
            bans: await nomearBans(imported.bans),
            gameVersion: imported.gameVersion,
            surrendered: imported.surrendered,
            playedAt: imported.playedAt,
          }
        );
        return {
          criada: false,
          data: {
            saved: true,
            refreshed: true,
            match: already,
            message:
              `Estatísticas do jogo ${already.matchNumber} atualizadas: ${updated} jogadores` +
              `, ${teams} time(s), ${bans} ban(s).`,
          },
        };
      } catch (erro) {
        if (!(erro instanceof SeriesError)) throw erro;
        throw new IngestError(erro.message, erro.code, 409);
      }
    }

    return {
      criada: false,
      data: {
        saved: false,
        alreadyImported: true,
        match: already,
        message:
          `A partida ${imported.riotMatchId} já tinha sido registrada (jogo ${already.matchNumber}).` +
          ' Use refreshStats para reescrever a scoreboard com os dados atuais.',
      },
    };
  }

  // refreshStats atualiza o que existe, e SO isso. Sem esta guarda, varrer o
  // historico do cliente para consertar as partidas registradas importaria de
  // carona todo custom antigo que aparecesse no caminho -- e todos cairiam na
  // MD3 em andamento, que nao tem nada a ver com eles.
  if (options.refreshStats) {
    return {
      criada: false,
      data: {
        saved: false,
        skipped: true,
        message: `A partida ${imported.riotMatchId} não está registrada. refreshStats só atualiza partida existente.`,
      },
    };
  }

  // --- serie de destino: so a partir daqui, porque so quem vai GRAVAR precisa ---
  let targetSeriesId = options.seriesId;
  if (!targetSeriesId) {
    const ongoing = await prisma.series.findFirst({
      where: { status: 'ONGOING' },
      orderBy: { date: 'desc' },
    });
    if (!ongoing) {
      throw new IngestError(
        'Nenhuma MD3 em andamento. Abra uma na aba Série antes de importar.',
        'NO_ONGOING_SERIES',
        409
      );
    }
    targetSeriesId = ongoing.id;
  }

  if (options.dryRun) {
    return {
      criada: false,
      data: {
        saved: false,
        source: options.source,
        preview: { ...imported, players: matched },
        rolesFullyInferred: imported.rolesFullyInferred,
        autoLinked: linked,
        autoCreated: created,
        seriesId: targetSeriesId,
      },
    };
  }

  const result = await recordMatch({
    seriesId: targetSeriesId,
    matchNumber: options.matchNumber,
    winner: imported.winner,
    gameDurationSec: imported.gameDurationSec,
    riotMatchId: imported.riotMatchId,
    source: options.source,
    gameVersion: imported.gameVersion,
    surrendered: imported.surrendered,
    playedAt: imported.playedAt,
    players: matched,
    teams: imported.teams,
    bans: await nomearBans(imported.bans),
  });

  return {
    criada: true,
    data: {
      saved: true,
      source: options.source,
      autoLinked: linked,
      autoCreated: created,
      // A UI usa isso para pedir conferencia das posicoes quando a origem nao
      // soube inferir todas.
      rolesFullyInferred: imported.rolesFullyInferred,
      match: result.match,
      series: result.series,
    },
  };
}

/**
 * Importação por Match ID (API pública da Riot, aba Série).
 *
 * Casa os participantes com o cadastro pelo PUUID e não grava pela metade:
 * uma partida com 8 de 10 jogadores estragaria o leaderboard em silêncio, então
 * recusa dizendo quem falta vincular.
 */
export async function importarPartidaDaRiot(
  imported: ImportedMatch,
  opcoes: { seriesId: string; matchNumber?: number; dryRun?: boolean }
): Promise<IngestResult> {
  const known = await prisma.player.findMany({
    where: { puuid: { in: imported.participants.map((p) => p.puuid) } },
    select: { id: true, puuid: true, name: true },
  });
  const byPuuid = new Map(known.map((player) => [player.puuid as string, player]));

  const matched: MatchPlayerInput[] = [];
  const unmatched: { puuid: string; riotId: string | null; championName: string }[] = [];

  for (const participant of imported.participants) {
    const player = byPuuid.get(participant.puuid);
    if (!player) {
      unmatched.push({
        puuid: participant.puuid,
        riotId: participant.riotId,
        championName: participant.championName,
      });
      continue;
    }

    matched.push({
      playerId: player.id,
      teamSide: participant.teamSide,
      rolePlayed: participant.rolePlayed,
      championName: participant.championName,
      championId: participant.championId,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      damage: participant.damage,
      damageTaken: participant.damageTaken,
      goldEarned: participant.goldEarned,
      visionScore: participant.visionScore,
      cs: participant.cs,
    });
  }

  if (unmatched.length > 0) {
    throw new IngestError(
      `${unmatched.length} participante(s) da partida não estão vinculados a nenhum jogador cadastrado.`,
      'UNMATCHED_PARTICIPANTS',
      409,
      { unmatched, preview: imported }
    );
  }

  if (opcoes.dryRun) {
    return { criada: false, data: { preview: { ...imported, players: matched }, saved: false } };
  }

  const result = await recordMatch({
    seriesId: opcoes.seriesId,
    matchNumber: opcoes.matchNumber,
    winner: imported.winner,
    gameDurationSec: imported.gameDurationSec,
    riotMatchId: imported.riotMatchId,
    source: 'RIOT_API',
    players: matched,
  });

  return { criada: true, data: { ...result, saved: true, isCustomGame: imported.isCustomGame } };
}

/** O que o agente confere no boot: a MD3 aberta e quantos jogadores têm PUUID. */
export async function statusDaIngestao() {
  const [ongoing, linkedCount, totalPlayers] = await Promise.all([
    prisma.series.findFirst({
      where: { status: 'ONGOING' },
      orderBy: { date: 'desc' },
      select: { id: true, name: true, blueScore: true, redScore: true },
    }),
    prisma.player.count({ where: { puuid: { not: null } } }),
    prisma.player.count(),
  ]);

  return {
    ongoingSeries: ongoing,
    linkedPlayers: linkedCount,
    totalPlayers,
    ready: ongoing !== null,
  };
}
