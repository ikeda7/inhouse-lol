import { describe, expect, it } from 'vitest';
import { selectCaptains, type CaptainCandidate } from '../lib/captainsDraft.js';
import { DraftError } from '../lib/autoBalance.js';

/**
 * Capitães escolhidos na mão: "quem quer tirar o time" é decisão do grupo,
 * e nenhum critério automático acerta isso. A regra é simples, e por isso
 * mesmo tem de recusar o que não faz sentido em vez de escolher por conta.
 */

const elenco: CaptainCandidate[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: `Jogador ${i}`,
  roles: ['FILL'],
  rating: 1000,
}));

function tentar(captainIds?: [string, string]) {
  return () => selectCaptains({ roster: elenco, mode: 'MANUAL', captainIds });
}

describe('selectCaptains no modo MANUAL', () => {
  it('o primeiro escolhido tira o azul e o segundo o vermelho', () => {
    const capitaes = selectCaptains({ roster: elenco, mode: 'MANUAL', captainIds: ['p3', 'p7'] });

    expect(capitaes.BLUE.id).toBe('p3');
    expect(capitaes.RED.id).toBe('p7');
  });

  it('recusa o mesmo jogador nos dois lados', () => {
    expect(tentar(['p3', 'p3'])).toThrow(DraftError);
  });

  it('recusa capitão que não está entre os 10', () => {
    expect(tentar(['p3', 'quem-nao-veio'])).toThrow(/dois capitães diferentes/);
  });

  it('recusa quando ninguém foi escolhido, em vez de escolher sozinho', () => {
    expect(tentar(undefined)).toThrow(DraftError);
  });
});
