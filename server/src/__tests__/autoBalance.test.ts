import { describe, it, expect } from 'vitest';
import {
  autoBalanceTeams,
  assignRolesWithinTeam,
  DraftError,
  type DraftablePlayer,
} from '../lib/autoBalance.js';
import { ROLES, type Role } from '../lib/roles.js';

/** Elenco do grupo + um decimo jogador, ja que o seed tem 9. */
const ROSTER: DraftablePlayer[] = [
  { id: '1', name: 'Vini', roles: ['JUNGLE', 'TOP', 'ADC'] },
  { id: '2', name: 'Kayon', roles: ['JUNGLE', 'MID'] },
  { id: '3', name: 'Denyon', roles: ['TOP', 'ADC'] },
  { id: '4', name: 'Cangosul', roles: ['SUPPORT', 'TOP', 'JUNGLE'] },
  { id: '5', name: 'Lara', roles: ['MID', 'SUPPORT', 'ADC'] },
  { id: '6', name: 'Ikeda', roles: ['FILL'] },
  { id: '7', name: 'Bruno', roles: ['MID', 'SUPPORT', 'JUNGLE'] },
  { id: '8', name: 'Leo', roles: ['MID', 'JUNGLE', 'ADC'] },
  { id: '9', name: 'Kaio', roles: ['SUPPORT', 'MID', 'ADC'] },
  { id: '10', name: 'Convidado', roles: ['FILL'] },
];

/** Invariante central: 2 times, 5 roles unicas cada, 10 pessoas distintas. */
function expectValidTeams(result: ReturnType<typeof autoBalanceTeams>) {
  for (const team of [result.blueTeam, result.redTeam]) {
    const rolesInTeam = team.players.map((entry) => entry.role);
    expect(new Set(rolesInTeam).size).toBe(5);
    expect(new Set(rolesInTeam)).toEqual(new Set(ROLES));
  }

  const allIds = [...result.blueTeam.players, ...result.redTeam.players].map(
    (entry) => entry.player.id
  );
  expect(allIds).toHaveLength(10);
  expect(new Set(allIds).size).toBe(10);
}

/** Todo mundo foi alocado dentro do pool que declarou? */
function expectRolesRespected(result: ReturnType<typeof autoBalanceTeams>) {
  for (const entry of [...result.blueTeam.players, ...result.redTeam.players]) {
    const declared = entry.player.roles;
    const acceptsAll = declared.includes('FILL');
    if (!acceptsAll) {
      expect(declared).toContain(entry.role);
    }
  }
}

describe('autoBalanceTeams', () => {
  it('monta dois times completos com as 5 roles unicas em cada lado', () => {
    const result = autoBalanceTeams(ROSTER, { seed: 42 });
    expectValidTeams(result);
    expectRolesRespected(result);
  });

  it('nunca aloca ninguem fora do pool declarado, em 200 sorteios diferentes', () => {
    for (let seed = 0; seed < 200; seed++) {
      const result = autoBalanceTeams(ROSTER, { seed });
      expectValidTeams(result);
      expectRolesRespected(result);
    }
  });

  it('resolve o gargalo primeiro e usa o Fill para tapar o buraco', () => {
    // 8 jogadores travados em 4 roles + 2 Fill. A unica saida possivel e os
    // dois Fill assumirem os dois SUPPORT.
    const roster: DraftablePlayer[] = [
      { id: 'a1', name: 'Top1', roles: ['TOP'] },
      { id: 'a2', name: 'Top2', roles: ['TOP'] },
      { id: 'a3', name: 'Jg1', roles: ['JUNGLE'] },
      { id: 'a4', name: 'Jg2', roles: ['JUNGLE'] },
      { id: 'a5', name: 'Mid1', roles: ['MID'] },
      { id: 'a6', name: 'Mid2', roles: ['MID'] },
      { id: 'a7', name: 'Adc1', roles: ['ADC'] },
      { id: 'a8', name: 'Adc2', roles: ['ADC'] },
      { id: 'a9', name: 'Fill1', roles: ['FILL'] },
      { id: 'a10', name: 'Fill2', roles: ['FILL'] },
    ];

    const result = autoBalanceTeams(roster, { seed: 7 });
    expectValidTeams(result);

    const supports = [result.blueTeam.slots.SUPPORT, result.redTeam.slots.SUPPORT];
    expect(supports.map((entry) => entry.player.name).sort()).toEqual(['Fill1', 'Fill2']);
  });

  it('respeita a role principal quando ha folga na composicao', () => {
    // Todos declaram uma main distinta + FILL como plano B. Com 2 de cada main,
    // ninguem precisa sair da main.
    const mains: Role[] = [...ROLES, ...ROLES];
    const roster: DraftablePlayer[] = mains.map((role, i) => ({
      id: `p${i}`,
      name: `${role}${i}`,
      roles: [role, 'FILL'],
    }));

    const result = autoBalanceTeams(roster, { seed: 3 });
    for (const entry of [...result.blueTeam.players, ...result.redTeam.players]) {
      expect(entry.role).toBe(entry.player.roles[0]);
      expect(entry.preferenceIndex).toBe(0);
    }
    expect(result.comfortCost).toBe(0);
  });

  it('equilibra os times pelo rating interno', () => {
    // 5 jogadores fortes e 5 fracos: um sorteio ingenuo poderia juntar todos os
    // fortes de um lado. A pontuacao tem que separar.
    const roster: DraftablePlayer[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      roles: ['FILL'],
      rating: i < 5 ? 1400 : 800,
    }));

    const result = autoBalanceTeams(roster, { seed: 11 });
    expectValidTeams(result);

    // O empate perfeito e IMPOSSIVEL aqui: com k fortes no azul, a diferenca e
    // |1200k - 3000|, que so assume 600, 1800 ou 3000. O otimo e 600 (divisao
    // 3-2). Exigir menos que isso seria exigir algo aritmeticamente inexistente.
    expect(result.ratingDiff).toBe(600);

    const strongPerTeam = [result.blueTeam, result.redTeam].map(
      (team) => team.players.filter((entry) => entry.player.rating === 1400).length
    );
    expect(strongPerTeam.sort()).toEqual([2, 3]);
  });

  it('e reproduzivel: a mesma seed devolve exatamente os mesmos times', () => {
    const first = autoBalanceTeams(ROSTER, { seed: 999 });
    const second = autoBalanceTeams(ROSTER, { seed: 999 });

    const signature = (r: typeof first) =>
      [...r.blueTeam.players, ...r.redTeam.players]
        .map((e) => `${e.side}:${e.role}:${e.player.id}`)
        .join('|');

    expect(signature(first)).toBe(signature(second));
  });

  it('produz composicoes diferentes com seeds diferentes', () => {
    const signature = (seed: number) =>
      autoBalanceTeams(ROSTER, { seed })
        .blueTeam.players.map((e) => e.player.id)
        .join(',');

    const signatures = new Set(
      Array.from({ length: 30 }, (_, seed) => signature(seed * 137))
    );
    // Nao exigimos 30 composicoes unicas (o otimo restringe), mas o sorteio nao
    // pode ser sempre igual.
    expect(signatures.size).toBeGreaterThan(1);
  });

  describe('erros', () => {
    it('recusa elenco que nao tem exatamente 10 jogadores', () => {
      expect(() => autoBalanceTeams(ROSTER.slice(0, 9))).toThrowError(DraftError);
      expect(() => autoBalanceTeams(ROSTER.slice(0, 9))).toThrowError(
        /exatamente 10 jogadores/
      );
    });

    it('recusa jogador duplicado', () => {
      const duplicated = [...ROSTER.slice(0, 9), ROSTER[0]];
      expect(() => autoBalanceTeams(duplicated)).toThrowError(/duplicado/i);
    });

    it('recusa jogador sem nenhuma role', () => {
      const broken = [...ROSTER.slice(0, 9), { id: 'x', name: 'Sem role', roles: [] }];
      expect(() => autoBalanceTeams(broken)).toThrowError(/nenhuma role/);
    });

    it('explica qual gargalo tornou a composicao impossivel', () => {
      // 5 pessoas so jogam TOP, mas so existem 2 vagas de TOP.
      const roster: DraftablePlayer[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `t${i}`,
          name: `Top${i}`,
          roles: ['TOP' as const],
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `f${i}`,
          name: `Fill${i}`,
          roles: ['FILL' as const],
        })),
      ];

      try {
        autoBalanceTeams(roster);
        throw new Error('deveria ter lancado');
      } catch (error) {
        expect(error).toBeInstanceOf(DraftError);
        const draftError = error as DraftError;
        expect(draftError.code).toBe('INFEASIBLE_ROLES');
        expect(draftError.message).toContain('TOP');
        expect(draftError.message).toContain('2 vaga');
      }
    });
  });

  it('roda rapido mesmo no pior caso (10 jogadores Fill)', () => {
    const roster: DraftablePlayer[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      roles: ['FILL'],
    }));

    const started = Date.now();
    const result = autoBalanceTeams(roster, { seed: 1 });
    const elapsed = Date.now() - started;

    expectValidTeams(result);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('assignRolesWithinTeam', () => {
  it('distribui as 5 roles dentro de um time ja formado', () => {
    const team = assignRolesWithinTeam(ROSTER.slice(0, 5), 'BLUE', { seed: 5 });
    expect(new Set(team.players.map((entry) => entry.role))).toEqual(new Set(ROLES));
    expect(team.players.every((entry) => entry.side === 'BLUE')).toBe(true);
  });

  it('recusa time que nao tem 5 jogadores', () => {
    expect(() => assignRolesWithinTeam(ROSTER.slice(0, 4))).toThrowError(
      /exatamente 5 jogadores/
    );
  });
});
