import { describe, it, expect } from 'vitest';
import {
  extractRoflMetadata,
  roflToLcuGame,
  parseRoflFilename,
  type RoflMetadata,
} from '../lib/rofl.js';
import { mapLcuGame } from '../lib/lcu.js';
import type { DraftablePlayer } from '../lib/autoBalance.js';

/**
 * Fixture no formato REAL do statsJson: todo valor e string, campeao em SKIN,
 * TEAM como "100"/"200", WIN como "Win"/"Fail".
 *
 * TEAM_POSITION vem VAZIO de proposito -- e o que acontece em custom game de
 * verdade (verificado num replay real de 2024).
 */
function buildStats(overrides: Partial<Record<string, string>>[] = []) {
  return Array.from({ length: 10 }, (_, i) => ({
    NAME: `Jogador${i + 1}`,
    PUUID: `puuid-${i + 1}`,
    SKIN: ['Aatrox', 'LeeSin', 'Ahri', 'Jinx', 'Thresh', 'Garen', 'Vi', 'Zed', 'Caitlyn', 'Leona'][
      i
    ],
    TEAM: i < 5 ? '100' : '200',
    WIN: i < 5 ? 'Win' : 'Fail',
    CHAMPIONS_KILLED: String(i + 1),
    NUM_DEATHS: '3',
    ASSISTS: '7',
    TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: String(15000 + i * 500),
    TOTAL_DAMAGE_TAKEN: '21000',
    GOLD_EARNED: '12000',
    VISION_SCORE: String(20 + i),
    MINIONS_KILLED: '150',
    NEUTRAL_MINIONS_KILLED: '20',
    TEAM_POSITION: '',
    INDIVIDUAL_POSITION: 'Invalid',
    ...overrides[i],
  }));
}

function buildMetadata(stats = buildStats()): RoflMetadata {
  return {
    gameLength: 1_501_000,
    lastGameChunkId: 30,
    lastKeyFrameId: 15,
    statsJson: JSON.stringify(stats),
  };
}

const SOURCE = { platformId: 'BR1', gameId: 3019927113, playedAtMs: 1_700_000_000_000 };

describe('extractRoflMetadata', () => {
  /**
   * Simula um .rofl: lixo binario, o bloco JSON no meio, mais lixo depois.
   * O parser tem que achar o bloco sem depender de offset fixo -- que e
   * exatamente o motivo dessa funcao existir (os offsets do header classico
   * nao valem no formato atual).
   */
  function fakeRofl(metadata: RoflMetadata): Buffer {
    return Buffer.concat([
      Buffer.from('RIOT\x02\x00', 'latin1'),
      Buffer.alloc(512, 0xab),
      Buffer.from(JSON.stringify(metadata), 'utf8'),
      Buffer.alloc(256, 0xcd),
    ]);
  }

  it('acha o bloco JSON no meio de dados binarios', () => {
    const metadata = extractRoflMetadata(fakeRofl(buildMetadata()));
    expect(metadata.gameLength).toBe(1_501_000);
    expect(typeof metadata.statsJson).toBe('string');
    expect(JSON.parse(metadata.statsJson as string)).toHaveLength(10);
  });

  it('nao se perde com as chaves que existem DENTRO do statsJson', () => {
    // statsJson e uma string cheia de '{' e '}'. Se a contagem de chaves nao
    // ignorasse o conteudo de string, o bloco terminaria cedo demais.
    const metadata = extractRoflMetadata(fakeRofl(buildMetadata()));
    const stats = JSON.parse(metadata.statsJson as string);
    expect(stats[9].SKIN).toBe('Leona');
  });

  it('avisa quando o arquivo nao tem estatisticas legiveis', () => {
    const semStats = Buffer.concat([Buffer.from('RIOT\x02\x00', 'latin1'), Buffer.alloc(1024, 7)]);
    expect(() => extractRoflMetadata(semStats)).toThrowError(/estatísticas/i);
  });
});

describe('roflToLcuGame', () => {
  it('converte para o shape do LCU, com os numeros ja parseados', () => {
    const game = roflToLcuGame(buildMetadata(), SOURCE);

    expect(game.gameId).toBe(3019927113);
    expect(game.platformId).toBe('BR1');
    expect(game.gameDuration).toBe(1501); // ms -> s
    expect(game.participants).toHaveLength(10);

    const first = game.participants![0];
    // Chegaram como string no replay; tem que sair numero.
    expect(first.stats!.kills).toBe(1);
    expect(first.stats!.deaths).toBe(3);
    expect(first.stats!.totalDamageDealtToChampions).toBe(15000);
    expect(first.championName).toBe('Aatrox');
  });

  it('traduz o vencedor a partir de WIN/TEAM em string', () => {
    const azul = roflToLcuGame(buildMetadata(), SOURCE);
    expect(azul.teams).toEqual([
      { teamId: 100, win: 'Win' },
      { teamId: 200, win: 'Fail' },
    ]);

    // Agora o time 200 vence: o primeiro jogador (time 100) tem WIN=Fail.
    const invertido = buildStats().map((p) => ({ ...p, WIN: p.TEAM === '200' ? 'Win' : 'Fail' }));
    const vermelho = roflToLcuGame(buildMetadata(invertido), SOURCE);
    expect(vermelho.teams).toEqual([
      { teamId: 100, win: 'Fail' },
      { teamId: 200, win: 'Win' },
    ]);
  });

  it('recusa replay que nao tenha 10 jogadores', () => {
    const curto = buildMetadata(buildStats().slice(0, 6));
    expect(() => roflToLcuGame(curto, SOURCE)).toThrowError(/esperava 10/);
  });

  it('recusa metadata sem statsJson', () => {
    expect(() => roflToLcuGame({ gameLength: 1000 }, SOURCE)).toThrowError(/statsJson/);
  });
});

describe('replay -> partida completa (integracao com o mapper do LCU)', () => {
  it('resolve as 5 roles por time mesmo com TEAM_POSITION vazio', () => {
    const game = roflToLcuGame(buildMetadata(), SOURCE);
    const imported = mapLcuGame(game);

    for (const side of ['BLUE', 'RED'] as const) {
      const roles = imported.participants
        .filter((p) => p.teamSide === side)
        .map((p) => p.rolePlayed);
      expect(new Set(roles).size).toBe(5);
    }
    // O replay nao trouxe posicao: a UI precisa saber que foi deduzido.
    expect(imported.rolesFullyInferred).toBe(false);
    expect(imported.winner).toBe('BLUE');
    expect(imported.isCustomGame).toBe(true);
  });

  it('usa o pool declarado para posicionar quem tem role unica', () => {
    const game = roflToLcuGame(buildMetadata(), SOURCE);
    const pool = new Map<string, DraftablePlayer>([
      ['puuid-3', { id: 'igor', name: 'Ígor', roles: ['JUNGLE'] }],
    ]);

    const imported = mapLcuGame(game, pool);
    const igor = imported.participants.find((p) => p.puuid === 'puuid-3');
    expect(igor?.rolePlayed).toBe('JUNGLE');
  });

  it('mantem o nome do campeao vindo do replay', () => {
    const imported = mapLcuGame(roflToLcuGame(buildMetadata(), SOURCE));
    expect(imported.participants.map((p) => p.championName)).toContain('Thresh');
    // O replay nao tem id numerico; quem resolve e o Data Dragon, depois.
    expect(imported.participants[0].championId).toBe(0);
  });

  it('gera um riotMatchId no formato do match-v5, para idempotencia', () => {
    const imported = mapLcuGame(roflToLcuGame(buildMetadata(), SOURCE));
    expect(imported.riotMatchId).toBe('BR1_3019927113');
  });
});

describe('parseRoflFilename', () => {
  it('extrai plataforma e gameId do nome do arquivo', () => {
    expect(parseRoflFilename('BR1-3019927113.rofl')).toEqual({
      platformId: 'BR1',
      gameId: 3019927113,
    });
  });

  it('devolve null para nome fora do padrao', () => {
    expect(parseRoflFilename('minha-partida.rofl')).toBeNull();
    expect(parseRoflFilename('BR1-123.txt')).toBeNull();
  });
});
