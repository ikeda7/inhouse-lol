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
/** Quantos momentos a tela mostra. Alem disso vira lista de banco de dados. */
const MAX_MOMENTOS = 30;

interface LinhaCrua {
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
  championName: string;
  championId: number | null;
  rolePlayed: string;
  largestMultiKill: number;
  largestKillingSpree: number;
  pentaKills: number;
  quadraKills: number;
  firstBloodKill: boolean;
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

export interface Momento extends ContextoDoDestaque {
  tipo: 'PENTA' | 'QUADRA' | 'SPREE';
  /** Sequencia, quando tipo = SPREE. */
  valor: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
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
  { chave: 'deaths', valor: (l) => l.deaths, minimoParaValer: 2 },
];

function contexto(linha: LinhaCrua, ddragonId: string | null): ContextoDoDestaque {
  return {
    playerId: linha.player.id,
    playerName: linha.player.name,
    championName: linha.championName,
    ddragonId,
    rolePlayed: linha.rolePlayed,
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
  const momentos: Momento[] = [];
  for (const linha of linhas) {
    const base = { ...contexto(linha, icone(linha.championName)) };
    const numeros = {
      kills: linha.kills,
      deaths: linha.deaths,
      assists: linha.assists,
      win: linha.win,
    };

    // Multikill e sequencia sao momentos independentes: quem penta e ainda
    // emenda uma sequencia longa aparece duas vezes, e deve.
    if (linha.largestMultiKill >= 5) {
      momentos.push({ ...base, ...numeros, tipo: 'PENTA', valor: linha.largestMultiKill });
    } else if (linha.largestMultiKill >= MIN_MULTIKILL_PARA_MOMENTO) {
      momentos.push({ ...base, ...numeros, tipo: 'QUADRA', valor: linha.largestMultiKill });
    }

    if (linha.largestKillingSpree >= MIN_SPREE_PARA_MOMENTO) {
      momentos.push({ ...base, ...numeros, tipo: 'SPREE', valor: linha.largestKillingSpree });
    }
  }

  momentos.sort(
    (a, b) =>
      // Mais recente primeiro; dentro da mesma partida, o feito maior em cima.
      new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime() || b.valor - a.valor
  );

  return {
    recordes,
    momentos: momentos.slice(0, MAX_MOMENTOS),
    partidas: new Set(linhas.map((l) => l.match.id)).size,
  };
}
