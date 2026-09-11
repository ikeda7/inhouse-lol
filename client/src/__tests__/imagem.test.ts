import { describe, expect, it } from 'vitest';
import { duracao, milhar, resolvedorDeIcone } from '../lib/imagem/canvas';
import { elencoDoTimeA, ladoDoTimeA } from '../lib/imagem/serie';
import type { ChampionManifest, TeamSide } from '../types';

/**
 * As peças puras das imagens exportadas. O desenho em si só se confere num
 * navegador de verdade (jsdom não tem canvas); o que decide O QUE é desenhado
 * -- em especial qual lado é o time A em cada jogo -- se confere aqui.
 */

const linha = (id: string, teamSide: TeamSide) => ({ teamSide, player: { id, name: id } });

describe('milhar', () => {
  it('abrevia a partir de mil, sem ".0" sobrando', () => {
    expect(milhar(950)).toBe('950');
    expect(milhar(12_345)).toBe('12.3k');
    expect(milhar(36_000)).toBe('36k');
  });
});

describe('duracao', () => {
  it('escreve em minutos e cala quando não sabe', () => {
    expect(duracao(1850)).toBe('31 min');
    expect(duracao(null)).toBeNull();
  });
});

describe('resolvedorDeIcone', () => {
  const manifest = {
    version: '1',
    champions: [{ id: 'LeeSin', key: 64, name: 'Lee Sin', squareUrl: 'https://x/LeeSin.png' }],
  } as ChampionManifest;

  it('acha o ícone pelo nome, sem ligar para maiúscula', () => {
    expect(resolvedorDeIcone(manifest)('lee sin')).toBe('https://x/LeeSin.png');
  });

  it('sem manifesto ou sem campeão, devolve null em vez de quebrar a imagem', () => {
    expect(resolvedorDeIcone(null)('Lee Sin')).toBeNull();
    expect(resolvedorDeIcone(manifest)('champion:999')).toBeNull();
  });
});

describe('time A da série (placar por elenco)', () => {
  const jogo1 = {
    matchNumber: 1,
    stats: [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => linha(id, 'BLUE')),
      ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => linha(id, 'RED')),
    ],
  };

  it('é quem jogou de azul no primeiro jogo', () => {
    expect([...elencoDoTimeA([jogo1] as never)].sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('segue o elenco quando os times trocam de lado', () => {
    const elenco = elencoDoTimeA([jogo1] as never);
    const jogo2 = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => linha(id, 'RED')),
      ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => linha(id, 'BLUE')),
    ];
    expect(ladoDoTimeA(jogo2, elenco)).toBe('RED');
  });

  it('aguenta uma substituição: vale a maioria do elenco', () => {
    const elenco = elencoDoTimeA([jogo1] as never);
    const comReserva = [
      ...['a1', 'a2', 'a3', 'a4', 'reserva'].map((id) => linha(id, 'RED')),
      ...['a5', 'b2', 'b3', 'b4', 'b5'].map((id) => linha(id, 'BLUE')),
    ];
    expect(ladoDoTimeA(comReserva, elenco)).toBe('RED');
  });
});
