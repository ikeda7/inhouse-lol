/**
 * O CAMPEAO como assunto: quem e escolhido, quem e banido, quem ganha e como
 * ele se sai na mao do grupo.
 *
 * Aqui nada e "de alguem": a pessoa aparece so como curiosidade ("quem mais
 * joga"). E a conversa de "esse campeao e banido toda noite", que so existe se
 * ban e pick forem contados juntos.
 *
 * Presenca = escolhido OU banido, sobre o total de partidas. E a medida que o
 * cenario competitivo usa: um campeao banido em 80% das partidas e forte
 * mesmo que quase nunca chegue a ser jogado.
 */

export interface EscolhaDeCampeao {
  championName: string;
  championId: number | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  /** Duracao da partida; null quando a origem nao sabe (replay antigo). */
  duracaoEmSegundos: number | null;
  playerId: string;
  playerName: string;
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
  /** (abates + assistencias) / mortes, duas casas. Null sem jogo. */
  kda: number | null;
  /** Media de dano a campeoes por minuto. Null sem jogo com duracao. */
  danoPorMinuto: number | null;
  /** Quem mais jogou esse campeao no grupo. Null quando so foi banido. */
  quemMaisJoga: { playerId: string; name: string; jogos: number } | null;
}

/**
 * Recorde de taxa (winrate, KDA) so com historico: com um jogo, "100% de
 * Yasuo" e sorte. Mesmo motivo do minimo das duplas.
 */
export const JOGOS_MINIMOS_DO_RECORDE = 3;

export interface RecordeDoCampeao {
  categoria: string;
  championName: string;
  championId: number | null;
  /** O numero que decidiu a categoria. */
  valor: number;
  /** Ja formatado para a tela ("75%", "4.50", "9"). */
  exibicao: string;
  /** Contexto embaixo do numero: "4 jogos · 3V–1D". */
  detalhe: string;
}

const porcentagem = (parte: number, total: number) =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

const duasCasas = (n: number) => Math.round(n * 100) / 100;

interface Acumulado {
  championId: number | null;
  partidas: number;
  vitorias: number;
  bans: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  minutos: number;
  partidasComDuracao: number;
  porJogador: Map<string, { playerId: string; name: string; jogos: number }>;
}

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
  const porCampeao = new Map<string, Acumulado>();

  const entrada = (nome: string, championId: number | null) => {
    const atual = porCampeao.get(nome) ?? {
      championId,
      partidas: 0,
      vitorias: 0,
      bans: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      minutos: 0,
      partidasComDuracao: 0,
      porJogador: new Map(),
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
    linha.kills += escolha.kills;
    linha.deaths += escolha.deaths;
    linha.assists += escolha.assists;
    // Dano por minuto só conta partida com duração conhecida: somar dano de
    // uma partida sem duração puxaria a média para baixo sem motivo.
    if (escolha.duracaoEmSegundos && escolha.duracaoEmSegundos > 0) {
      linha.damage += escolha.damage;
      linha.minutos += escolha.duracaoEmSegundos / 60;
      linha.partidasComDuracao += 1;
    }
    const dono = linha.porJogador.get(escolha.playerId) ?? {
      playerId: escolha.playerId,
      name: escolha.playerName,
      jogos: 0,
    };
    dono.jogos += 1;
    linha.porJogador.set(escolha.playerId, dono);
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
      // Sem morrer nao vira infinito: conta como uma morte, a mesma conta do
      // KDA do perfil.
      kda:
        linha.partidas === 0
          ? null
          : duasCasas((linha.kills + linha.assists) / Math.max(1, linha.deaths)),
      danoPorMinuto: linha.minutos === 0 ? null : Math.round(linha.damage / linha.minutos),
      quemMaisJoga:
        [...linha.porJogador.values()].sort(
          (a, b) => b.jogos - a.jogos || a.name.localeCompare(b.name)
        )[0] ?? null,
    }))
    .sort(
      (a, b) =>
        b.presenca - a.presenca ||
        b.partidas - a.partidas ||
        a.championName.localeCompare(b.championName)
    );
}

interface Categoria {
  chave: string;
  /** Null tira o campeao da disputa daquela categoria. */
  valor: (c: EstatisticaDeCampeao) => number | null;
  exibicao?: (valor: number) => string;
  /** Taxa: so vale com historico. */
  exigeMinimo?: boolean;
  /** Menor ganha (o pior aproveitamento é a zoeira). */
  menorVence?: boolean;
}

const CATEGORIAS: Categoria[] = [
  { chave: 'maisEscolhido', valor: (c) => c.partidas },
  { chave: 'maisBanido', valor: (c) => c.bans },
  { chave: 'maiorPresenca', valor: (c) => c.presenca, exibicao: (v) => `${v}%` },
  {
    chave: 'melhorWinrate',
    valor: (c) => c.winRate,
    exibicao: (v) => `${v}%`,
    exigeMinimo: true,
  },
  { chave: 'melhorKda', valor: (c) => c.kda, exibicao: (v) => v.toFixed(2), exigeMinimo: true },
  {
    chave: 'piorWinrate',
    valor: (c) => c.winRate,
    exibicao: (v) => `${v}%`,
    exigeMinimo: true,
    menorVence: true,
  },
];

/**
 * Um recorde por categoria, sempre de um CAMPEAO.
 *
 * Empate fica com quem apareceu em mais partidas: entre dois 100%, o de seis
 * jogos diz mais que o de tres.
 */
export function recordesDosCampeoes(
  estatisticas: readonly EstatisticaDeCampeao[]
): RecordeDoCampeao[] {
  const recordes: RecordeDoCampeao[] = [];

  for (const categoria of CATEGORIAS) {
    const elegiveis = categoria.exigeMinimo
      ? estatisticas.filter((c) => c.partidas >= JOGOS_MINIMOS_DO_RECORDE)
      : estatisticas;

    let melhor: EstatisticaDeCampeao | null = null;
    let melhorValor = 0;
    for (const campeao of elegiveis) {
      const valor = categoria.valor(campeao);
      if (valor === null) continue;
      // Zero so entra quando MENOR vence: "mais banido: 0" nao diz nada, mas
      // "pior aproveitamento: 0%" e exatamente a piada.
      if (valor <= 0 && !categoria.menorVence) continue;
      const ganha = !melhor
        ? true
        : categoria.menorVence
          ? valor < melhorValor
          : valor > melhorValor;
      const desempata =
        valor === melhorValor && melhor !== null && campeao.partidas > melhor.partidas;
      if (ganha || desempata) {
        melhor = campeao;
        melhorValor = valor;
      }
    }

    if (!melhor) continue;
    recordes.push({
      categoria: categoria.chave,
      championName: melhor.championName,
      championId: melhor.championId,
      valor: melhorValor,
      exibicao: (categoria.exibicao ?? String)(melhorValor),
      detalhe: detalheDo(melhor),
    });
  }

  return recordes;
}

/** "4 jogos · 3V–1D · 2 bans" -- de onde o número saiu. */
function detalheDo(campeao: EstatisticaDeCampeao): string {
  const partes: string[] = [];
  if (campeao.partidas > 0) {
    partes.push(`${campeao.partidas} ${campeao.partidas === 1 ? 'jogo' : 'jogos'}`);
    partes.push(`${campeao.vitorias}V–${campeao.partidas - campeao.vitorias}D`);
  }
  if (campeao.bans > 0) partes.push(`${campeao.bans} ${campeao.bans === 1 ? 'ban' : 'bans'}`);
  return partes.join(' · ');
}
