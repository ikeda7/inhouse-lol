import { describe, expect, it } from 'vitest';
import { duplasDe, JOGOS_MINIMOS_DA_DUPLA, type LinhaDeDupla } from '../lib/duplas.js';

/** Uma partida: `azul` e `vermelho` são os ids de cada lado; `venceu` diz quem ganhou. */
function partida(
  matchId: string,
  azul: string[],
  vermelho: string[],
  venceu: 'BLUE' | 'RED'
): LinhaDeDupla[] {
  return [
    ...azul.map((playerId) => ({ matchId, playerId, teamSide: 'BLUE', win: venceu === 'BLUE' })),
    ...vermelho.map((playerId) => ({ matchId, playerId, teamSide: 'RED', win: venceu === 'RED' })),
  ];
}

describe('duplas', () => {
  it('parceiro é quem jogou do mesmo lado; adversário não entra', () => {
    const linhas = [1, 2, 3].flatMap((n) => partida(`m${n}`, ['eu', 'ana'], ['bia'], 'BLUE'));
    const { melhores, piores } = duplasDe('eu', linhas);
    expect(melhores).toEqual([{ parceiroId: 'ana', jogos: 3, vitorias: 3, winRate: 100 }]);
    expect(piores).toEqual([]);
  });

  it(`com menos de ${JOGOS_MINIMOS_DA_DUPLA} jogos juntos a dupla não aparece`, () => {
    const linhas = [1, 2].flatMap((n) => partida(`m${n}`, ['eu', 'ana'], ['bia'], 'BLUE'));
    expect(duplasDe('eu', linhas)).toEqual({ melhores: [], piores: [] });
  });

  it('abaixo de 50% vai para "perde mais com", da menor para a maior', () => {
    const linhas = [
      // com a ana: 3 derrotas
      ...[1, 2, 3].flatMap((n) => partida(`a${n}`, ['eu', 'ana'], ['x'], 'RED')),
      // com o caio: 1 vitória e 2 derrotas
      ...partida('c1', ['eu', 'caio'], ['x'], 'BLUE'),
      ...[2, 3].flatMap((n) => partida(`c${n}`, ['eu', 'caio'], ['x'], 'RED')),
      // com a bia: 2 vitórias e 1 derrota
      ...[1, 2].flatMap((n) => partida(`b${n}`, ['eu', 'bia'], ['x'], 'BLUE')),
      ...partida('b3', ['eu', 'bia'], ['x'], 'RED'),
    ];
    const { melhores, piores } = duplasDe('eu', linhas);
    expect(melhores.map((d) => [d.parceiroId, d.winRate])).toEqual([['bia', 66.7]]);
    expect(piores.map((d) => [d.parceiroId, d.winRate])).toEqual([
      ['ana', 0],
      ['caio', 33.3],
    ]);
  });

  it('dupla em 50% não ganha mais nem perde mais: não entra em nenhuma lista', () => {
    const linhas = [
      ...[1, 2].flatMap((n) => partida(`v${n}`, ['eu', 'ana'], ['x'], 'BLUE')),
      ...[3, 4].flatMap((n) => partida(`d${n}`, ['eu', 'ana'], ['x'], 'RED')),
    ];
    expect(duplasDe('eu', linhas)).toEqual({ melhores: [], piores: [] });
  });

  it('winrate empatado: quem jogou mais junto vem antes, e cada lista para em 3', () => {
    const linhas = [
      ...['ana', 'bia', 'caio', 'duda'].flatMap((parceiro) =>
        [1, 2, 3].flatMap((n) => partida(`${parceiro}${n}`, ['eu', parceiro], ['x'], 'BLUE'))
      ),
      ...[4, 5].flatMap((n) => partida(`duda${n}`, ['eu', 'duda'], ['x'], 'BLUE')),
    ];
    const { melhores } = duplasDe('eu', linhas);
    expect(melhores.map((d) => d.parceiroId)).toEqual(['duda', 'ana', 'bia']);
  });

  it('partida em que a pessoa não jogou não conta para ninguém', () => {
    const linhas = [1, 2, 3].flatMap((n) => partida(`m${n}`, ['ana', 'bia'], ['caio'], 'BLUE'));
    expect(duplasDe('eu', linhas)).toEqual({ melhores: [], piores: [] });
  });
});
