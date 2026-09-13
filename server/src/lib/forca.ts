/**
 * Força de um jogador pelo histórico, na escala de rating do sorteio.
 *
 * O sorteio (lib/autoBalance) sempre soube equilibrar por rating, mas o rating
 * era o `internalRating` do cadastro -- 1000 para todo mundo, porque ninguém
 * nunca preencheu. Com todos iguais, "equilibrar" não fazia nada e os times
 * saíam só com as roles encaixadas. O grupo reclamou: "se continuar
 * desbalanceado assim desanima".
 *
 * A força junta duas coisas que o grupo já vê no ranking:
 *
 *   - KDA, o mesmo número da tabela (abates + assistências por morte, no total
 *     dos jogos). Comparado em escala logarítmica: KDA é razão, e 10 contra 5
 *     é a mesma distância que 2 contra 1.
 *   - Vitórias. Pesam menos que o KDA porque dependem também de com quem a
 *     pessoa caiu -- e é justamente isso que o sorteio está tentando mudar.
 *
 * Quem jogou pouco fica perto da média do grupo: somam-se alguns jogos
 * "emprestados" da média antes de fazer a conta. Sem isso, um 2-0 com KDA 10
 * no primeiro dia viraria o mais forte do grupo. Quem nunca jogou fica
 * exatamente na média.
 */

import { NEUTRAL_RATING } from './autoBalance.js';

export interface HistoricoDoJogador {
  jogos: number;
  vitorias: number;
  /** KDA do ranking: (abates + assistências) / max(mortes, 1), no total. */
  kda: number;
}

export interface OpcoesDeForca {
  /** Jogos emprestados da média do grupo antes de fazer a conta. */
  jogosDePeso: number;
  pesoKda: number;
  pesoVitorias: number;
  /** Pontos de rating por unidade de força. */
  escala: number;
}

export const FORCA: OpcoesDeForca = {
  jogosDePeso: 4,
  pesoKda: 0.6,
  pesoVitorias: 0.4,
  escala: 150,
};

/**
 * Quantas vezes a média do grupo o KDA pode valer, para cima ou para baixo. Um
 * KDA 90 de quem não morreu em nove jogos não pode pesar mais que "muito bom":
 * sem o teto, um jogador desses decide o sorteio inteiro sozinho.
 */
const TETO_DO_KDA = 4;

/**
 * O que o sorteio considera de um jogador: KDA e vitórias (0 a 1) depois do
 * empréstimo da média e do teto. É isso que a tela mostra como média do time
 * -- o KDA cru de um jogador com 100 fazia um time parelho parecer torto.
 */
export function historicoConsiderado(
  historico: HistoricoDoJogador | undefined,
  kdaDoGrupo: number,
  opcoes: Partial<OpcoesDeForca> = {}
): { kda: number; vitorias: number } {
  const { jogosDePeso } = { ...FORCA, ...opcoes };
  if (!(kdaDoGrupo > 0)) return { kda: 0, vitorias: 0.5 };
  if (!historico || historico.jogos <= 0) return { kda: kdaDoGrupo, vitorias: 0.5 };

  const peso = historico.jogos + jogosDePeso;
  const kda = (historico.jogos * historico.kda + jogosDePeso * kdaDoGrupo) / peso;
  return {
    kda: Math.min(Math.max(kda, kdaDoGrupo / TETO_DO_KDA), kdaDoGrupo * TETO_DO_KDA),
    vitorias: (historico.vitorias + jogosDePeso * 0.5) / peso,
  };
}

export function ratingPorHistorico(
  historico: HistoricoDoJogador | undefined,
  kdaDoGrupo: number,
  opcoes: Partial<OpcoesDeForca> = {}
): number {
  const { pesoKda, pesoVitorias, escala } = { ...FORCA, ...opcoes };
  if (!historico || historico.jogos <= 0 || !(kdaDoGrupo > 0)) return NEUTRAL_RATING;

  const { kda, vitorias } = historicoConsiderado(historico, kdaDoGrupo, opcoes);
  const forca = pesoKda * Math.log(kda / kdaDoGrupo) + pesoVitorias * (vitorias - 0.5) * 2;
  return Math.round(NEUTRAL_RATING + escala * forca);
}
