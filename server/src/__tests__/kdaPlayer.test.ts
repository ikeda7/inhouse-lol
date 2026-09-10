import { describe, expect, it } from 'vitest';
import {
  calcularKillParticipation,
  escolherKdaPlayer,
  type CandidatoAoSelo,
  type LinhaParaParticipacao,
} from '../services/stats.js';

/**
 * O selo de "KDA player" (issue #16).
 *
 * Vale teste porque e a unica estatistica do projeto que ACUSA alguem. Um erro
 * aqui nao aparece como bug: aparece como injustica na tabela, e o grupo
 * discute a pessoa em vez de discutir o codigo.
 *
 * Os casos abaixo sao os que quebraram a primeira implementacao ou que quase
 * quebraram: o jungler que carrega, o time que nao matou ninguem, e a margem.
 */

function linha(
  playerId: string,
  matchId: string,
  teamSide: string,
  kills: number,
  assists: number
): LinhaParaParticipacao {
  return { playerId, kills, assists, teamSide, match: { id: matchId } };
}

function candidato(
  playerId: string,
  kda: number,
  killParticipation: number,
  games = 4
): CandidatoAoSelo {
  return { playerId, games, kda, killParticipation };
}

describe('calcularKillParticipation', () => {
  it('divide abates + assistencias pelos abates do proprio time', () => {
    // Time azul fez 10 abates. Quem participou de 8 deles tem 80%.
    const rows = [
      linha('a', 'm1', 'BLUE', 6, 2),
      linha('b', 'm1', 'BLUE', 4, 4),
      linha('c', 'm1', 'RED', 3, 0),
    ];

    const kp = calcularKillParticipation(rows);

    expect(kp.get('a')).toBeCloseTo(0.8);
    expect(kp.get('b')).toBeCloseTo(0.8);
  });

  it('usa os abates do time certo, nao o total da partida', () => {
    // Se somasse os dois times (10 + 3 = 13), o jogador do vermelho daria
    // 3/13 = 23% em vez dos 100% que ele de fato participou.
    const rows = [linha('a', 'm1', 'BLUE', 10, 0), linha('c', 'm1', 'RED', 3, 0)];

    expect(calcularKillParticipation(rows).get('c')).toBeCloseTo(1);
  });

  it('ignora partida em que o time nao matou ninguem', () => {
    // Participacao num time de 0 abates e indefinida, nao zero. Contar como
    // zero puniria quem jogou um estomp ao contrario.
    const rows = [
      linha('a', 'm1', 'BLUE', 0, 0),
      linha('a', 'm2', 'BLUE', 5, 5),
      linha('x', 'm2', 'BLUE', 5, 0),
    ];

    // So a partida 2 conta: 10 de 10 abates do time.
    expect(calcularKillParticipation(rows).get('a')).toBeCloseTo(1);
  });

  it('faz media entre partidas, nao soma', () => {
    const rows = [
      linha('a', 'm1', 'BLUE', 10, 0), // 100%
      linha('a', 'm2', 'BLUE', 0, 0), // 0% -- time fez abates, ele nao participou
      linha('b', 'm2', 'BLUE', 10, 0),
    ];

    expect(calcularKillParticipation(rows).get('a')).toBeCloseTo(0.5);
  });
});

describe('escolherKdaPlayer', () => {
  it('escolhe quem tem KDA alto E participacao baixa', () => {
    const dono = escolherKdaPlayer([
      candidato('farmador', 8, 0.3),
      candidato('normal1', 2, 0.6),
      candidato('normal2', 2, 0.6),
      candidato('normal3', 2, 0.6),
    ]);

    expect(dono).toBe('farmador');
  });

  it('NAO escolhe quem tem KDA alto com participacao alta', () => {
    // Este e o caso que quebrou a primeira versao: um jungler 7/1/27 tem KDA
    // altissimo, mas esteve em toda briga. Isso e carregar, nao farmar KDA.
    const dono = escolherKdaPlayer([
      candidato('carregador', 10, 0.9),
      candidato('normal1', 2, 0.5),
      candidato('normal2', 2, 0.5),
      candidato('normal3', 2, 0.5),
    ]);

    expect(dono).toBeNull();
  });

  it('NAO escolhe quem tem participacao baixa mas KDA baixo tambem', () => {
    // Participacao baixa sozinha nao e o selo -- e so alguem jogando mal.
    const dono = escolherKdaPlayer([
      candidato('ruim', 0.5, 0.2),
      candidato('normal1', 3, 0.6),
      candidato('normal2', 3, 0.6),
      candidato('normal3', 3, 0.6),
    ]);

    expect(dono).toBeNull();
  });

  it('nao da o selo quando a desproporcao e pequena demais', () => {
    // Todo mundo parecido: ninguem merece ser acusado de nada.
    const dono = escolherKdaPlayer([
      candidato('a', 3.0, 0.58),
      candidato('b', 2.9, 0.6),
      candidato('c', 2.9, 0.6),
      candidato('d', 2.9, 0.62),
    ]);

    expect(dono).toBeNull();
  });

  it('ignora quem tem poucos jogos', () => {
    // Uma partida sortuda nao pode definir um titulo que dura.
    const dono = escolherKdaPlayer([
      candidato('visitante', 20, 0.1, 1),
      candidato('normal1', 2, 0.6),
      candidato('normal2', 2, 0.6),
      candidato('normal3', 2, 0.6),
    ]);

    expect(dono).toBeNull();
  });

  it('nao da selo com menos de dois elegiveis -- nao ha media para comparar', () => {
    expect(escolherKdaPlayer([candidato('sozinho', 10, 0.1)])).toBeNull();
  });

  it('escolhe o mais desproporcional quando ha mais de um candidato', () => {
    const dono = escolherKdaPlayer([
      candidato('pouco', 4, 0.45),
      candidato('muito', 8, 0.25),
      candidato('normal1', 2, 0.6),
      candidato('normal2', 2, 0.6),
    ]);

    expect(dono).toBe('muito');
  });
});
