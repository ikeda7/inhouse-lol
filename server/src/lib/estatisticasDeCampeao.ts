/**
 * Estatisticas por campeao, do grupo inteiro: quem e escolhido, quem e banido
 * e quem ganha.
 *
 * Diferente de lib/recordesDeCampeao.ts, que premia UMA pessoa com UM campeao.
 * Aqui o assunto e o campeao em si -- e a conversa de "esse campeao e banido
 * toda noite", que so existe se ban e pick forem contados juntos.
 *
 * Presenca = escolhido OU banido, sobre o total de partidas. E a medida que o
 * cenario competitivo usa: um campeao banido em 80% das partidas e forte
 * mesmo que quase nunca chegue a ser jogado.
 */

export interface EscolhaDeCampeao {
  championName: string;
  championId: number | null;
  win: boolean;
}

export interface BanimentoDeCampeao {
  championName: string;
  championId: number | null;
}

export interface EstatisticaDeCampeao {
  championName: string;
  championId: number | null;
  partidas: number;
  vitorias: number;
  bans: number;
  /** 0-100, uma casa. */
  pickRate: number;
  banRate: number;
  presenca: number;
  /** Null quando o campeao so foi banido: sem jogo, nao existe aproveitamento. */
  winRate: number | null;
}

const porcentagem = (parte: number, total: number) =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

/**
 * Uma linha por campeao que apareceu (escolhido ou banido), da maior presenca
 * para a menor. Empate de presenca: quem foi mais escolhido vem antes -- foi
 * mais jogado, tem mais historia; depois, ordem alfabetica para a lista nao
 * dancar entre duas consultas iguais.
 */
export function estatisticasDeCampeao(
  escolhas: readonly EscolhaDeCampeao[],
  banimentos: readonly BanimentoDeCampeao[],
  totalDePartidas: number
): EstatisticaDeCampeao[] {
  const porCampeao = new Map<
    string,
    { championId: number | null; partidas: number; vitorias: number; bans: number }
  >();

  const entrada = (nome: string, championId: number | null) => {
    const atual = porCampeao.get(nome) ?? {
      championId,
      partidas: 0,
      vitorias: 0,
      bans: 0,
    };
    // O id pode chegar null de uma origem e preenchido de outra (o .rofl traz
    // o nome, o LCU traz o numero): fica o que existir.
    if (atual.championId === null && championId !== null) atual.championId = championId;
    porCampeao.set(nome, atual);
    return atual;
  };

  for (const escolha of escolhas) {
    const linha = entrada(escolha.championName, escolha.championId);
    linha.partidas += 1;
    if (escolha.win) linha.vitorias += 1;
  }

  for (const ban of banimentos) {
    entrada(ban.championName, ban.championId).bans += 1;
  }

  return [...porCampeao.entries()]
    .map(([championName, linha]) => ({
      championName,
      championId: linha.championId,
      partidas: linha.partidas,
      vitorias: linha.vitorias,
      bans: linha.bans,
      pickRate: porcentagem(linha.partidas, totalDePartidas),
      banRate: porcentagem(linha.bans, totalDePartidas),
      // Escolhido E banido na mesma partida nao acontece: banido nao entra em
      // jogo. Entao somar os dois nao conta a mesma partida duas vezes.
      presenca: porcentagem(linha.partidas + linha.bans, totalDePartidas),
      winRate: linha.partidas === 0 ? null : porcentagem(linha.vitorias, linha.partidas),
    }))
    .sort(
      (a, b) =>
        b.presenca - a.presenca ||
        b.partidas - a.partidas ||
        a.championName.localeCompare(b.championName)
    );
}
