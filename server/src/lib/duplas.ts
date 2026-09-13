/**
 * Duplas: com quem uma pessoa mais ganha (e mais perde) jogando no MESMO time.
 *
 * Parceiro é quem estava do mesmo lado na mesma partida. O lado (`teamSide`)
 * serve aqui porque a comparação é dentro de UMA partida; entre jogos de uma
 * MD3 os times trocam de lado, mas isso não importa para "estavam juntos".
 *
 * Só conta dupla com `JOGOS_MINIMOS_DA_DUPLA` jogos juntos. Com um jogo só,
 * "100% com fulano" é sorte, e a lista viraria ruído que o grupo leva a sério.
 */

export interface LinhaDeDupla {
  matchId: string;
  playerId: string;
  teamSide: string;
  win: boolean;
}

export interface Dupla {
  parceiroId: string;
  jogos: number;
  vitorias: number;
  /** 0-100, uma casa. */
  winRate: number;
}

export const JOGOS_MINIMOS_DA_DUPLA = 3;
/** Quantas duplas cada lista mostra. */
export const DUPLAS_POR_LISTA = 3;

/**
 * `melhores`: winrate acima de 50%, da maior para a menor.
 * `piores`: abaixo de 50%, da menor para a maior -- a zoeira.
 * Exatamente 50% não entra em nenhuma: um 2-2 em verde embaixo de "Ganha mais
 * com" (foi o que apareceu em produção) afirma algo que o placar não diz.
 * O corte também impede a mesma dupla de aparecer nas duas listas quando a
 * pessoa tem poucos parceiros. Empate de winrate: quem jogou mais junto vem antes.
 */
export function duplasDe(
  playerId: string,
  linhas: readonly LinhaDeDupla[]
): { melhores: Dupla[]; piores: Dupla[] } {
  const porPartida = new Map<string, LinhaDeDupla[]>();
  for (const linha of linhas) {
    const daPartida = porPartida.get(linha.matchId) ?? [];
    daPartida.push(linha);
    porPartida.set(linha.matchId, daPartida);
  }

  const acumulado = new Map<string, { jogos: number; vitorias: number }>();
  for (const daPartida of porPartida.values()) {
    const eu = daPartida.find((linha) => linha.playerId === playerId);
    if (!eu) continue;
    for (const outro of daPartida) {
      if (outro.playerId === playerId || outro.teamSide !== eu.teamSide) continue;
      const dupla = acumulado.get(outro.playerId) ?? { jogos: 0, vitorias: 0 };
      acumulado.set(outro.playerId, {
        jogos: dupla.jogos + 1,
        vitorias: dupla.vitorias + (eu.win ? 1 : 0),
      });
    }
  }

  const duplas: Dupla[] = [...acumulado.entries()]
    .filter(([, dupla]) => dupla.jogos >= JOGOS_MINIMOS_DA_DUPLA)
    .map(([parceiroId, dupla]) => ({
      parceiroId,
      ...dupla,
      winRate: Math.round((dupla.vitorias / dupla.jogos) * 1000) / 10,
    }));

  const melhores = duplas
    .filter((dupla) => dupla.winRate > 50)
    .sort((a, b) => b.winRate - a.winRate || b.jogos - a.jogos)
    .slice(0, DUPLAS_POR_LISTA);
  const piores = duplas
    .filter((dupla) => dupla.winRate < 50)
    .sort((a, b) => a.winRate - b.winRate || b.jogos - a.jogos)
    .slice(0, DUPLAS_POR_LISTA);

  return { melhores, piores };
}
