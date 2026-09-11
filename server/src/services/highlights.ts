/**
 * Destaques: os grandes momentos das noites, extraidos do que ja esta gravado.
 *
 * Ideia do Vinim (issue #14). Duas leituras diferentes do mesmo dado:
 *
 *   - RECORDES: quem tem a melhor marca de todos os tempos em cada categoria.
 *     Responde "qual foi a maior partida que alguem jogou aqui".
 *   - MOMENTOS: linha do tempo de quadras, pentas e sequencias longas, do mais
 *     recente para o mais antigo. Responde "o que aconteceu na noite passada".
 *
 * Nada aqui e acumulado ou derivado de media: todo destaque aponta para UMA
 * partida especifica, porque a graca de um recorde e poder dizer em que jogo
 * ele aconteceu.
 */

import { prisma } from '../lib/prisma.js';
import { computeKda, round, safeDivide } from './stats.js';
import { resolveChampion } from '../lib/ddragon.js';

/** Sequencia de abates a partir da qual vale contar como momento. */
const MIN_SPREE_PARA_MOMENTO = 6;
/** Multikill a partir do qual vale contar como momento. */
const MIN_MULTIKILL_PARA_MOMENTO = 4;
/**
 * Quantos momentos a tela mostra. Com nove tipos, uma noite de 2 jogos rende
 * ~15 -- o corte precisa caber varias noites para a linha do tempo ter passado.
 */
const MAX_MOMENTOS = 60;

export interface LinhaCrua {
  playerId: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damageTaken: number;
  goldEarned: number;
  visionScore: number;
  cs: number;
  win: boolean;
  teamSide: string;
  championName: string;
  championId: number | null;
  rolePlayed: string;
  largestMultiKill: number;
  largestKillingSpree: number;
  pentaKills: number;
  quadraKills: number;
  firstBloodKill: boolean;
  damageSelfMitigated: number;
  timeCCingOthers: number;
  match: {
    id: string;
    matchNumber: number;
    gameDurationSec: number | null;
    playedAt: Date;
    seriesId: string;
    series: { name: string | null; date: Date };
  };
  player: { id: string; name: string };
}

/** De onde o destaque veio, para a tela poder linkar e datar. */
export interface ContextoDoDestaque {
  playerId: string;
  playerName: string;
  championName: string;
  ddragonId: string | null;
  rolePlayed: string;
  /**
   * De que lado o jogador estava NAQUELE jogo. Os times trocam de lado na MD3,
   * então "azul" só faz sentido por partida -- e é por partida que a tela e as
   * imagens pintam o cartão.
   */
  teamSide: string;
  matchId: string;
  matchNumber: number;
  seriesId: string;
  seriesName: string | null;
  playedAt: string;
}

export interface Recorde extends ContextoDoDestaque {
  /** Chave estavel da categoria, para a UI escolher icone e rotulo. */
  categoria: string;
  /** O numero em si. */
  valor: number;
  /** Como escrever o numero: "27", "1.2k", "8.50". */
  exibicao: string;
}

/**
 * Tipos de momento.
 *
 * Comecou so com multikill e sequencia, e o resultado foi uma linha do tempo em
 * que quase tudo era "spree" -- oito cartoes praticamente iguais. Momento tem
 * que ser variado para valer a rolagem, entao entram tambem os superlativos DA
 * PARTIDA: quem fez mais dano naquele jogo, quem nao morreu, quem segurou a
 * porrada, quem enxergou o mapa, quem farmou.
 *
 * Superlativo de partida nao concorre com Recorde: recorde e de todos os
 * tempos, momento e daquela noite. E assim que recap de campeonato funciona.
 */
export type TipoDeMomento =
  | 'PENTA'
  | 'QUADRA'
  | 'SPREE'
  | 'SEM_MORRER'
  | 'CARRY'
  | 'MURALHA'
  | 'VISAO'
  | 'FARM'
  | 'FIRST_BLOOD';

export interface Momento extends ContextoDoDestaque {
  tipo: TipoDeMomento;
  /** O numero do feito: tamanho da sequencia, dano, visao, cs/min... */
  valor: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  /**
   * Raridade, para ordenar dentro da mesma partida. Penta em cima, first blood
   * embaixo -- senao a ordem dentro de uma noite fica arbitraria.
   */
  peso: number;
}

export interface Destaques {
  recordes: Recorde[];
  momentos: Momento[];
  /** Quantas partidas alimentaram esses numeros -- a tela avisa se for pouco. */
  partidas: number;
}

function formatarMilhar(valor: number): string {
  return valor >= 1000 ? `${round(valor / 1000, 1)}k` : String(valor);
}

/**
 * Categorias de recorde.
 *
 * Cada uma diz como extrair o numero de uma partida e como escrever ele. Fica
 * em tabela para acrescentar categoria sem mexer na logica de comparacao -- e
 * porque a ordem daqui e a ordem na tela.
 */
const CATEGORIAS: {
  chave: string;
  valor: (linha: LinhaCrua) => number;
  exibicao?: (valor: number) => string;
  /** Recorde de morte e piada, nao merito: exige mais de um jogo para valer. */
  minimoParaValer?: number;
}[] = [
  { chave: 'kills', valor: (l) => l.kills },
  {
    chave: 'kda',
    valor: (l) => computeKda(l.kills, l.deaths, l.assists),
    exibicao: (v) => v.toFixed(2),
  },
  { chave: 'damage', valor: (l) => l.damage, exibicao: formatarMilhar },
  {
    chave: 'dpm',
    valor: (l) => round(safeDivide(l.damage, (l.match.gameDurationSec ?? 0) / 60)),
    exibicao: formatarMilhar,
  },
  { chave: 'cs', valor: (l) => l.cs },
  { chave: 'gold', valor: (l) => l.goldEarned, exibicao: formatarMilhar },
  { chave: 'damageTaken', valor: (l) => l.damageTaken, exibicao: formatarMilhar },
  { chave: 'vision', valor: (l) => l.visionScore },
  { chave: 'spree', valor: (l) => l.largestKillingSpree, minimoParaValer: 2 },
  { chave: 'assists', valor: (l) => l.assists },
  /** Segundos de CC aplicado: o recorde que o suporte tem chance de levar. */
  { chave: 'cc', valor: (l) => l.timeCCingOthers },
  { chave: 'deaths', valor: (l) => l.deaths, minimoParaValer: 2 },
];

// ---------------------------------------------------------------------------
// Pisos dos momentos
//
// Todo superlativo de partida tem um piso ABSOLUTO alem de ser o maior do jogo.
// Sem isso, uma partida ruim de 14 minutos elegeria "maior visao da partida"
// com 12 pontos -- tecnicamente o maior, e nada de especial. Momento tem que
// ser notavel, nao apenas o topo de uma lista fraca.
// ---------------------------------------------------------------------------

/** Abates + assistencias para "nao morreu" virar feito, e nao so passividade. */
const MIN_PARTICIPACAO_SEM_MORRER = 8;
const MIN_VISAO_PARA_MOMENTO = 50;
const MIN_CS_POR_MIN_PARA_MOMENTO = 7;
/** Dano a campeoes: abaixo disso, ser o maior da partida nao diz nada. */
const MIN_DANO_PARA_CARRY = 20000;

/** Raridade de cada tipo. Ordena os momentos dentro da mesma noite. */
const PESO: Record<TipoDeMomento, number> = {
  PENTA: 100,
  QUADRA: 90,
  SEM_MORRER: 70,
  SPREE: 60,
  CARRY: 50,
  MURALHA: 40,
  FARM: 30,
  VISAO: 25,
  FIRST_BLOOD: 10,
};

function csPorMinuto(linha: LinhaCrua): number {
  const minutos = (linha.match.gameDurationSec ?? 0) / 60;
  return minutos > 0 ? linha.cs / minutos : 0;
}

/**
 * Extrai os momentos de todas as partidas.
 *
 * Os superlativos precisam do contexto da PARTIDA inteira (quem foi o maior
 * dano daquele jogo), entao as linhas sao agrupadas por partida antes.
 */
export function extrairMomentos(
  linhas: LinhaCrua[],
  icone: (nome: string) => string | null
): Momento[] {
  const porPartida = new Map<string, LinhaCrua[]>();
  for (const linha of linhas) {
    const atual = porPartida.get(linha.match.id);
    if (atual) atual.push(linha);
    else porPartida.set(linha.match.id, [linha]);
  }

  const momentos: Momento[] = [];

  for (const daPartida of porPartida.values()) {
    const maior = (pegar: (l: LinhaCrua) => number) =>
      daPartida.reduce((topo, l) => Math.max(topo, pegar(l)), 0);

    const maxDano = maior((l) => l.damage);
    const maxSofrido = maior((l) => l.damageTaken);
    const maxMitigado = maior((l) => l.damageSelfMitigated);
    const maxVisao = maior((l) => l.visionScore);
    const maxCsMin = maior(csPorMinuto);

    for (const linha of daPartida) {
      const base = contexto(linha, icone(linha.championName));
      const numeros = {
        kills: linha.kills,
        deaths: linha.deaths,
        assists: linha.assists,
        win: linha.win,
      };
      const registrar = (tipo: TipoDeMomento, valor: number) =>
        momentos.push({ ...base, ...numeros, tipo, valor, peso: PESO[tipo] });

      // Multikill e sequencia sao independentes: quem penta e ainda emenda uma
      // sequencia longa aparece duas vezes, e deve.
      if (linha.largestMultiKill >= 5) registrar('PENTA', linha.largestMultiKill);
      else if (linha.largestMultiKill >= MIN_MULTIKILL_PARA_MOMENTO) {
        registrar('QUADRA', linha.largestMultiKill);
      }

      if (linha.largestKillingSpree >= MIN_SPREE_PARA_MOMENTO) {
        registrar('SPREE', linha.largestKillingSpree);
      }

      // Zero mortes com participacao: sem o piso, o suporte que ficou na base
      // a partida inteira entraria como feito.
      if (linha.deaths === 0 && linha.kills + linha.assists >= MIN_PARTICIPACAO_SEM_MORRER) {
        registrar('SEM_MORRER', linha.kills + linha.assists);
      }

      if (linha.damage === maxDano && linha.damage >= MIN_DANO_PARA_CARRY) {
        registrar('CARRY', linha.damage);
      }

      // Muralha exige os DOIS: so levar porrada é morrer muito; levar e mitigar
      // e ter segurado a linha de frente.
      if (
        linha.damageTaken === maxSofrido &&
        linha.damageSelfMitigated === maxMitigado &&
        maxSofrido > 0
      ) {
        registrar('MURALHA', linha.damageTaken);
      }

      if (linha.visionScore === maxVisao && linha.visionScore >= MIN_VISAO_PARA_MOMENTO) {
        registrar('VISAO', linha.visionScore);
      }

      const csMin = csPorMinuto(linha);
      if (csMin === maxCsMin && csMin >= MIN_CS_POR_MIN_PARA_MOMENTO) {
        registrar('FARM', round(csMin, 1));
      }

      if (linha.firstBloodKill) registrar('FIRST_BLOOD', 1);
    }
  }

  return momentos;
}

function contexto(linha: LinhaCrua, ddragonId: string | null): ContextoDoDestaque {
  return {
    playerId: linha.player.id,
    playerName: linha.player.name,
    championName: linha.championName,
    ddragonId,
    rolePlayed: linha.rolePlayed,
    teamSide: linha.teamSide,
    matchId: linha.match.id,
    matchNumber: linha.match.matchNumber,
    seriesId: linha.match.seriesId,
    seriesName: linha.match.series.name,
    playedAt: linha.match.playedAt.toISOString(),
  };
}

export async function getDestaques(): Promise<Destaques> {
  const linhas = (await prisma.matchPlayerStat.findMany({
    include: {
      match: {
        select: {
          id: true,
          matchNumber: true,
          gameDurationSec: true,
          playedAt: true,
          seriesId: true,
          series: { select: { name: true, date: true } },
        },
      },
      player: { select: { id: true, name: true } },
    },
  })) as unknown as LinhaCrua[];

  if (linhas.length === 0) return { recordes: [], momentos: [], partidas: 0 };

  // Um lookup por campeao, reaproveitado por todos os destaques. Sem isso, um
  // recorde e um momento do mesmo campeao baterlam no Data Dragon duas vezes.
  const icones = new Map<string, string | null>();
  for (const nome of new Set(linhas.map((l) => l.championName))) {
    const asset = await resolveChampion(nome).catch(() => null);
    icones.set(nome, asset?.id ?? null);
  }
  const icone = (nome: string) => icones.get(nome) ?? null;

  // --- recordes ---
  const recordes: Recorde[] = [];
  for (const categoria of CATEGORIAS) {
    let melhor: LinhaCrua | null = null;
    let melhorValor = -1;

    for (const linha of linhas) {
      const valor = categoria.valor(linha);
      // Empate fica com a partida mais antiga: quem chegou primeiro na marca.
      if (valor > melhorValor) {
        melhorValor = valor;
        melhor = linha;
      }
    }

    if (!melhor || melhorValor < (categoria.minimoParaValer ?? 1)) continue;

    recordes.push({
      ...contexto(melhor, icone(melhor.championName)),
      categoria: categoria.chave,
      valor: melhorValor,
      exibicao: (categoria.exibicao ?? String)(melhorValor),
    });
  }

  // --- momentos ---
  const momentos = extrairMomentos(linhas, icone);

  momentos.sort(
    (a, b) =>
      // Mais recente primeiro; dentro da mesma noite, o feito mais raro em cima.
      new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime() || b.peso - a.peso
  );

  return {
    recordes,
    momentos: momentos.slice(0, MAX_MOMENTOS),
    partidas: new Set(linhas.map((l) => l.match.id)).size,
  };
}
