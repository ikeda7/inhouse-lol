import { describe, expect, it } from 'vitest';
import { calcularMaximos } from '../components/MatchPlayerDetail';
import { ordenarPorLane } from '../components/ChampionIcon';
import { parseItems } from '../hooks/useBuild';
import { nomeDaSequencia, nomeDoMultikill } from '../lib/lolTerms';
import type { MatchStat, Role } from '../types';

/**
 * As funções puras do front.
 *
 * São poucas e baratas de testar, e cada uma sustenta algo visível: as barras
 * de comparação, a ordem do scoreboard, a build, e as palavras dos momentos.
 * Quando uma delas erra, nada dá exceção -- a tela só mostra a coisa errada.
 */

function stat(overrides: Partial<MatchStat>): MatchStat {
  return {
    id: 'x',
    playerId: 'p',
    teamSide: 'BLUE',
    rolePlayed: 'MID',
    championName: 'Ahri',
    championId: 103,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    damageTaken: 0,
    goldEarned: 0,
    visionScore: 0,
    cs: 0,
    win: true,
    doubleKills: 0,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 0,
    largestMultiKill: 0,
    firstBloodKill: false,
    firstBloodAssist: false,
    killingSprees: 0,
    largestCriticalStrike: 0,
    champLevel: 0,
    goldSpent: 0,
    totalDamageDealt: 0,
    damageToObjectives: 0,
    damageToTurrets: 0,
    damageSelfMitigated: 0,
    totalHeal: 0,
    physicalDamageToChampions: 0,
    magicDamageToChampions: 0,
    trueDamageToChampions: 0,
    timeCCingOthers: 0,
    longestTimeSpentLiving: 0,
    turretKills: 0,
    inhibitorKills: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    controlWardsBought: 0,
    laneMinionsKilled: 0,
    neutralMinionsKilled: 0,
    items: null,
    spell1Id: null,
    spell2Id: null,
    keystoneId: null,
    primaryStyleId: null,
    subStyleId: null,
    player: { id: 'p', name: 'Fulano' },
    ...overrides,
  };
}

describe('calcularMaximos', () => {
  it('pega o maior de cada métrica entre os dez', () => {
    const maximos = calcularMaximos([
      stat({ damage: 10000, goldEarned: 5000 }),
      stat({ damage: 30000, goldEarned: 3000 }),
      stat({ damage: 20000, goldEarned: 12000 }),
    ]);

    // Cada métrica tem o próprio dono: o maior dano e o maior ouro podem ser
    // pessoas diferentes, e a barra de cada uma compara com o dela.
    expect(maximos.damage).toBe(30000);
    expect(maximos.goldEarned).toBe(12000);
  });

  it('devolve zero quando não há partida, sem estourar', () => {
    // A barra divide por este valor. Se voltasse undefined, o estilo viraria
    // "width: NaN%" e a barra sumiria em silêncio.
    const maximos = calcularMaximos([]);

    expect(maximos.damage).toBe(0);
    expect(maximos.visionScore).toBe(0);
  });
});

describe('ordenarPorLane', () => {
  it('põe na ordem da Fenda, não na ordem que veio do banco', () => {
    const bagunçado = [
      { rolePlayed: 'SUPPORT' as Role },
      { rolePlayed: 'TOP' as Role },
      { rolePlayed: 'ADC' as Role },
      { rolePlayed: 'JUNGLE' as Role },
      { rolePlayed: 'MID' as Role },
    ];

    expect(ordenarPorLane(bagunçado).map((s) => s.rolePlayed)).toEqual([
      'TOP',
      'JUNGLE',
      'MID',
      'ADC',
      'SUPPORT',
    ]);
  });

  it('não altera a lista original', () => {
    const original = [{ rolePlayed: 'SUPPORT' as Role }, { rolePlayed: 'TOP' as Role }];
    ordenarPorLane(original);

    expect(original[0].rolePlayed).toBe('SUPPORT');
  });
});

describe('parseItems', () => {
  it('devolve null quando a origem não trouxe build', () => {
    // null e "tudo zero" são coisas diferentes: null é replay, que não guarda
    // build; zero é slot vazio de verdade.
    expect(parseItems(null)).toBeNull();
  });

  it('converte o CSV em sete slots, com zero para vazio', () => {
    expect(parseItems('3084,1056,0,3073,0,0,3340')).toEqual([3084, 1056, 0, 3073, 0, 0, 3340]);
  });

  it('trata pedaço inválido como slot vazio em vez de NaN', () => {
    // NaN chegaria na tela como um item que não existe, e o ícone sumiria sem
    // explicação. Zero mostra o quadrado vazio, que é a verdade.
    expect(parseItems('3084,,abc')).toEqual([3084, 0, 0]);
  });
});

describe('nomes que o jogo usa', () => {
  it('traduz o tamanho da sequência para a palavra do locutor', () => {
    expect(nomeDaSequencia(3)).toBe('KILLING SPREE');
    expect(nomeDaSequencia(5)).toBe('UNSTOPPABLE');
    expect(nomeDaSequencia(7)).toBe('GODLIKE');
    expect(nomeDaSequencia(11)).toBe('LEGENDARY');
  });

  it('não deixa sequência pequena sem nome', () => {
    // O componente só chama isso a partir de 6, mas devolver undefined aqui
    // apareceria como "undefined" no cartão.
    expect(nomeDaSequencia(1)).toBe('KILLING SPREE');
  });

  it('nomeia o multikill', () => {
    expect(nomeDoMultikill(5)).toBe('PENTAKILL');
    expect(nomeDoMultikill(4)).toBe('QUADRA KILL');
    expect(nomeDoMultikill(3)).toBe('TRIPLE KILL');
  });
});
