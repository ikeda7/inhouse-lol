import { describe, it, expect } from 'vitest';
import { mapLcuGame, resolveTeamRoles, LcuError, type LcuGame } from '../lib/lcu.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';

/**
 * Fixture no formato REAL do LCU: stats aninhados, puuid em
 * participantIdentities e vencedor como string "Win"/"Fail".
 */
function buildGame(overrides: Partial<LcuGame> = {}): LcuGame {
  const lanes = [
    { lane: 'TOP', role: 'SOLO' },
    { lane: 'JUNGLE', role: 'NONE' },
    { lane: 'MIDDLE', role: 'SOLO' },
    { lane: 'BOTTOM', role: 'DUO_CARRY' },
    { lane: 'BOTTOM', role: 'DUO_SUPPORT' },
  ];

  const participants = Array.from({ length: 10 }, (_, i) => ({
    participantId: i + 1,
    championId: 100 + i,
    teamId: i < 5 ? 100 : 200,
    timeline: lanes[i % 5],
    stats: {
      kills: i,
      deaths: 2,
      assists: 4,
      totalDamageDealtToChampions: 10000 + i * 1000,
      totalDamageTaken: 20000,
      goldEarned: 11000,
      visionScore: 15 + i,
      totalMinionsKilled: 150,
      neutralMinionsKilled: 20,
      win: i < 5,
    },
  }));

  const participantIdentities = Array.from({ length: 10 }, (_, i) => ({
    participantId: i + 1,
    player: {
      puuid: `puuid-${i + 1}`,
      gameName: `Jogador${i + 1}`,
      tagLine: 'BR1',
      summonerName: `Jogador${i + 1}`,
    },
  }));

  return {
    gameId: 2800000001,
    platformId: 'BR1',
    gameCreation: 1_700_000_000_000,
    gameDuration: 1823,
    gameType: 'CUSTOM_GAME',
    gameMode: 'CLASSIC',
    queueId: 0,
    participants,
    participantIdentities,
    teams: [
      { teamId: 100, win: 'Win' },
      { teamId: 200, win: 'Fail' },
    ],
    ...overrides,
  };
}

describe('mapLcuGame', () => {
  it('traduz um custom game do cliente para o formato interno', () => {
    const result = mapLcuGame(buildGame());

    expect(result.riotMatchId).toBe('BR1_2800000001');
    expect(result.isCustomGame).toBe(true);
    expect(result.winner).toBe('BLUE');
    expect(result.gameDurationSec).toBe(1823);
    expect(result.participants).toHaveLength(10);
    expect(result.rolesFullyInferred).toBe(true);
  });

  it('le as estatisticas do objeto aninhado `stats`, nao do topo', () => {
    const result = mapLcuGame(buildGame());
    const first = result.participants[0];

    expect(first.kills).toBe(0);
    expect(first.deaths).toBe(2);
    expect(first.assists).toBe(4);
    expect(first.damage).toBe(10000);
    // cs = minions + monstros neutros
    expect(first.cs).toBe(170);
  });

  it('resolve o puuid via participantIdentities (nao vem no participant)', () => {
    const result = mapLcuGame(buildGame());
    expect(result.participants[0].puuid).toBe('puuid-1');
    expect(result.participants[0].riotId).toBe('Jogador1#BR1');
  });

  it('interpreta o vencedor como a string "Win", nao como booleano', () => {
    const redWins = mapLcuGame(
      buildGame({
        teams: [
          { teamId: 100, win: 'Fail' },
          { teamId: 200, win: 'Win' },
        ],
      })
    );
    expect(redWins.winner).toBe('RED');
    expect(redWins.participants.filter((p) => p.win).every((p) => p.teamSide === 'RED')).toBe(true);
  });

  it('separa ADC e Support na bot lane pelo campo role', () => {
    const result = mapLcuGame(buildGame());
    const blue = result.participants.filter((p) => p.teamSide === 'BLUE');

    expect(blue.map((p) => p.rolePlayed)).toEqual(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);
  });

  it('da as 5 roles unicas por time mesmo quando o cliente nao infere nada', () => {
    // Cenario real de custom game: o cliente devolve lane vazia para todos.
    const game = buildGame();
    game.participants = game.participants!.map((p) => ({
      ...p,
      timeline: { lane: 'NONE', role: 'NONE' },
    }));

    const result = mapLcuGame(game);

    for (const side of ['BLUE', 'RED'] as const) {
      const roles = result.participants.filter((p) => p.teamSide === side).map((p) => p.rolePlayed);
      expect(new Set(roles).size).toBe(5);
    }
    // Sinaliza que precisou adivinhar, para a UI pedir conferencia.
    expect(result.rolesFullyInferred).toBe(false);
  });

  it('usa o pool declarado para desempatar posicao ambigua', () => {
    const game = buildGame();
    // Todo o time azul sem lane: quem decide e o cadastro.
    game.participants = game.participants!.map((p) =>
      p.teamId === 100 ? { ...p, timeline: { lane: 'NONE', role: 'NONE' } } : p
    );

    // Igor so joga JUNGLE -- tem que cair no jungle, nao em outra vaga.
    const pool = new Map<string, DraftablePlayer>([
      ['puuid-1', { id: 'p1', name: 'Ígor', roles: ['JUNGLE'] }],
      ['puuid-2', { id: 'p2', name: 'Denyon', roles: ['TOP', 'ADC'] }],
    ]);

    const result = mapLcuGame(game, pool);
    const igor = result.participants.find((p) => p.puuid === 'puuid-1');
    const denyon = result.participants.find((p) => p.puuid === 'puuid-2');

    expect(igor?.rolePlayed).toBe('JUNGLE');
    expect(['TOP', 'ADC']).toContain(denyon?.rolePlayed);
  });

  it('recusa partida que nao tem 10 participantes', () => {
    const game = buildGame();
    game.participants = game.participants!.slice(0, 6);
    game.participantIdentities = game.participantIdentities!.slice(0, 6);

    expect(() => mapLcuGame(game)).toThrowError(LcuError);
    expect(() => mapLcuGame(game)).toThrowError(/esperava 10/);
  });

  it('recusa partida com times desbalanceados', () => {
    const game = buildGame();
    game.participants = game.participants!.map((p, i) => ({
      ...p,
      teamId: i < 6 ? 100 : 200, // 6x4
    }));

    expect(() => mapLcuGame(game)).toThrowError(/esperava 5/);
  });

  it('marca partida de fila normal como nao-custom', () => {
    const ranked = mapLcuGame(buildGame({ gameType: 'MATCHED_GAME', queueId: 420 }));
    expect(ranked.isCustomGame).toBe(false);
  });
});

describe('resolveTeamRoles', () => {
  it('mantem o que o cliente acertou e so preenche o buraco', () => {
    const participants = [
      { participantId: 1, timeline: { lane: 'TOP', role: 'SOLO' } },
      { participantId: 2, timeline: { lane: 'JUNGLE', role: 'NONE' } },
      { participantId: 3, timeline: { lane: 'MIDDLE', role: 'SOLO' } },
      { participantId: 4, timeline: { lane: 'BOTTOM', role: 'DUO_CARRY' } },
      { participantId: 5, timeline: { lane: 'NONE', role: 'NONE' } }, // faltou
    ];

    const { roleByParticipantId, inferred } = resolveTeamRoles(participants, new Map());

    expect(inferred).toBe(false);
    expect(roleByParticipantId.get(1)).toBe('TOP');
    expect(roleByParticipantId.get(5)).toBe('SUPPORT'); // a unica que sobrou
  });

  it('resolve conflito quando o cliente repete a mesma lane', () => {
    const participants = [
      { participantId: 1, timeline: { lane: 'MIDDLE', role: 'SOLO' } },
      { participantId: 2, timeline: { lane: 'MIDDLE', role: 'SOLO' } }, // duplicado
      { participantId: 3, timeline: { lane: 'JUNGLE', role: 'NONE' } },
      { participantId: 4, timeline: { lane: 'BOTTOM', role: 'DUO_CARRY' } },
      { participantId: 5, timeline: { lane: 'BOTTOM', role: 'DUO_SUPPORT' } },
    ];

    const { roleByParticipantId } = resolveTeamRoles(participants, new Map());

    expect(new Set([...roleByParticipantId.values()]).size).toBe(5);
    // O segundo "MID" tem que ir para a vaga que sobrou (TOP).
    expect(roleByParticipantId.get(2)).toBe('TOP');
  });
});

/**
 * Mapa e modo -- baseado em partidas REAIS deste grupo:
 *   mapId 11 + CLASSIC + queueId 3130 -> custom na Fenda com draft de torneio
 *   mapId 12 + KIWI    + queueId 3270 -> Abismo Uivante (nao conta)
 */
describe('mapa e modo de jogo', () => {
  it('aceita custom na Fenda com draft de torneio (queueId 3130)', () => {
    const result = mapLcuGame(buildGame({ mapId: 11, gameMode: 'CLASSIC', queueId: 3130 }));
    expect(result.mapId).toBe(11);
    expect(result.gameMode).toBe('CLASSIC');
    expect(result.queueId).toBe(3130);
    expect(result.isCustomGame).toBe(true);
  });

  it('recusa partida no Abismo Uivante, mesmo sendo custom', () => {
    // Sem essa checagem um ARAM de 10 pessoas entraria e estragaria a
    // estatistica: la nao existe lane nem CS comparavel.
    const aram = buildGame({ mapId: 12, gameMode: 'ARAM', queueId: 3270 });
    expect(() => mapLcuGame(aram)).toThrowError(LcuError);
    expect(() => mapLcuGame(aram)).toThrowError(/Abismo Uivante/);
  });

  it('explica que foi ARAM antes de reclamar da contagem de jogadores', () => {
    // O 3x3 do grupo falharia nas duas regras. "Foi ARAM" e a razao util.
    const aramCurto = buildGame({ mapId: 12, gameMode: 'KIWI', queueId: 3270 });
    aramCurto.participants = aramCurto.participants!.slice(0, 6);

    try {
      mapLcuGame(aramCurto);
      throw new Error('deveria ter lancado');
    } catch (error) {
      expect((error as LcuError).code).toBe('UNSUPPORTED_MAP');
    }
  });

  it('recusa modo rotativo mesmo na Fenda', () => {
    const urf = buildGame({ mapId: 11, gameMode: 'URF' });
    expect(() => mapLcuGame(urf)).toThrowError(/nao suportado/i);
  });

  it('nao barra quando a origem nao informa o mapa (caso do replay)', () => {
    // O .rofl nao guarda mapId. Barrar por ausencia impediria importar replay.
    const semMapa = buildGame({ mapId: undefined, gameMode: undefined });
    expect(() => mapLcuGame(semMapa)).not.toThrow();
  });
});

/**
 * Inferencia de role pelos SINAIS da partida.
 *
 * Regressao de um erro real reportado pelo grupo: o sistema gravou o Igor
 * (jungler puro) como TOP e o Vini de jungle numa noite em que ele jogou top.
 * A versao anterior adivinhava pelo pool declarado -- que diz o que a pessoa
 * COSTUMA jogar, nao o que ela jogou naquele jogo.
 */
describe('inferencia de role por sinais da partida', () => {
  /** Um participante com os sinais que o LCU realmente traz. */
  const jogador = (
    participantId: number,
    sinais: { smite?: boolean; laneCs?: number; selvaCs?: number; visao?: number }
  ) => ({
    participantId,
    spell1Id: sinais.smite ? 11 : 4,
    spell2Id: 12,
    timeline: { lane: 'NONE', role: 'NONE' },
    stats: {
      totalMinionsKilled: sinais.laneCs ?? 150,
      neutralMinionsKilled: sinais.selvaCs ?? 0,
      visionScore: sinais.visao ?? 20,
    },
  });

  it('coloca quem levou Smite no jungle, contra o pool declarado', () => {
    // O Igor só joga JUNGLE no cadastro, mas quem tem Smite aqui é o 2.
    // O pool não pode ganhar do que aconteceu na partida.
    const time = [
      jogador(1, { laneCs: 200 }),
      jogador(2, { smite: true, laneCs: 30, selvaCs: 90 }),
      jogador(3, { laneCs: 190 }),
      jogador(4, { laneCs: 210 }),
      jogador(5, { laneCs: 25, visao: 60 }),
    ];

    const pool = new Map([[1, { id: 'igor', name: 'Ígor', roles: ['JUNGLE' as const] }]]);

    const { roleByParticipantId } = resolveTeamRoles(time, pool);

    expect(roleByParticipantId.get(2)).toBe('JUNGLE');
    expect(roleByParticipantId.get(1)).not.toBe('JUNGLE');
  });

  it('identifica o support por CS baixo e visão alta', () => {
    const time = [
      jogador(1, { laneCs: 180 }),
      jogador(2, { smite: true, selvaCs: 80, laneCs: 40 }),
      jogador(3, { laneCs: 200 }),
      jogador(4, { laneCs: 220 }),
      jogador(5, { laneCs: 18, visao: 75 }),
    ];

    const { roleByParticipantId } = resolveTeamRoles(time, new Map());

    expect(roleByParticipantId.get(5)).toBe('SUPPORT');
    expect(roleByParticipantId.get(2)).toBe('JUNGLE');
  });

  it('sempre devolve as 5 roles, uma por jogador', () => {
    const time = [
      jogador(1, { laneCs: 150 }),
      jogador(2, { smite: true, selvaCs: 70, laneCs: 35 }),
      jogador(3, { laneCs: 170 }),
      jogador(4, { laneCs: 190 }),
      jogador(5, { laneCs: 20, visao: 55 }),
    ];

    const { roleByParticipantId } = resolveTeamRoles(time, new Map());

    expect(new Set(roleByParticipantId.values()).size).toBe(5);
    expect(roleByParticipantId.size).toBe(5);
  });

  it('resolve o ótimo quando dois candidatos disputam o jungle', () => {
    // Guloso erraria: fixaria o primeiro com sinal de selva e empurraria o
    // outro para uma role errada. Só um tem Smite.
    const time = [
      jogador(1, { smite: true, selvaCs: 90, laneCs: 30 }),
      jogador(2, { selvaCs: 45, laneCs: 120 }),
      jogador(3, { laneCs: 200 }),
      jogador(4, { laneCs: 210 }),
      jogador(5, { laneCs: 22, visao: 60 }),
    ];

    const { roleByParticipantId } = resolveTeamRoles(time, new Map());

    expect(roleByParticipantId.get(1)).toBe('JUNGLE');
    expect(roleByParticipantId.get(5)).toBe('SUPPORT');
  });

  it('mantém o caminho antigo quando não há sinal nenhum (replay antigo)', () => {
    const semSinais = [
      { participantId: 1, timeline: { lane: 'TOP', role: 'SOLO' } },
      { participantId: 2, timeline: { lane: 'JUNGLE', role: 'NONE' } },
      { participantId: 3, timeline: { lane: 'MIDDLE', role: 'SOLO' } },
      { participantId: 4, timeline: { lane: 'BOTTOM', role: 'DUO_CARRY' } },
      { participantId: 5, timeline: { lane: 'BOTTOM', role: 'DUO_SUPPORT' } },
    ];

    const { roleByParticipantId, inferred } = resolveTeamRoles(semSinais, new Map());

    expect(inferred).toBe(true);
    expect(roleByParticipantId.get(1)).toBe('TOP');
    expect(roleByParticipantId.get(5)).toBe('SUPPORT');
  });
});

/**
 * A ORDEM DO SAGUAO.
 *
 * O grupo define as lanes no saguao antes de comecar, e essa ordem sobrevive no
 * array de participantes. Medido nas 4 partidas reais: 8 times, 8 acertos --
 * o Smite sempre no segundo do time.
 *
 * Achado depois de o grupo apontar que o Cho'Gath do Crepaldi foi gravado como
 * MID quando ele jogou TOP. A posicao ja vinha pronta e estava sendo deduzida.
 */
describe('ordem do saguão', () => {
  const time = (comSmiteNoIndice: number) =>
    Array.from({ length: 5 }, (_, i) => ({
      participantId: i + 1,
      spell1Id: i === comSmiteNoIndice ? 11 : 4,
      spell2Id: 12,
      timeline: { lane: 'NONE', role: 'NONE' },
      stats: { totalMinionsKilled: 150, neutralMinionsKilled: 0, visionScore: 20 },
    }));

  it('usa a ordem do array quando o Smite valida a premissa', () => {
    // Smite no índice 1 = segundo do time = onde o jungle deve estar.
    const { roleByParticipantId, inferred } = resolveTeamRoles(time(1), new Map());

    expect([...roleByParticipantId.values()]).toEqual(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);
    // Veio pronto, não foi deduzido.
    expect(inferred).toBe(true);
  });

  it('ignora a ordem quando o Smite não bate com a posição do jungle', () => {
    // Smite no último: o saguão não seguiu a ordem. Não dá para confiar.
    const { roleByParticipantId } = resolveTeamRoles(time(4), new Map());

    expect(roleByParticipantId.get(5)).toBe('JUNGLE');
    expect(new Set(roleByParticipantId.values()).size).toBe(5);
  });

  it('não usa a ordem quando ninguém levou Smite', () => {
    // Sem Smite não há como validar. Cai na pontuação por sinais, que ainda
    // devolve as 5 roles.
    const semSmite = time(-1);
    const { roleByParticipantId } = resolveTeamRoles(semSmite, new Map());

    expect(new Set(roleByParticipantId.values()).size).toBe(5);
  });

  it('respeita a ordem mesmo contra o pool declarado', () => {
    // O pool diz que o participante 1 só joga JUNGLE, mas o saguão o pôs na
    // primeira vaga (TOP). O saguão vence: é o que aconteceu de fato.
    const pool = new Map([[1, { id: 'x', name: 'Ígor', roles: ['JUNGLE' as const] }]]);
    const { roleByParticipantId } = resolveTeamRoles(time(1), pool);

    expect(roleByParticipantId.get(1)).toBe('TOP');
    expect(roleByParticipantId.get(2)).toBe('JUNGLE');
  });
});
