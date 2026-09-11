import { ROLES, type MatchStat, type Role, type SeriesDetail } from '../types';
import { selosDaSerie, type SeloConquistado } from './selos';
import { elencoDoTimeA, ladoDoTimeA } from './timeDaSerie';

/**
 * O jogador na MD3 inteira (issue #97): a soma dos jogos que ele jogou.
 *
 * O time é por ELENCO (lib/timeDaSerie): quem trocou de lado entre os jogos
 * continua no mesmo time. Quem entrou só num jogo aparece com o que jogou,
 * mas não disputa os selos da MD3 -- o total de um jogo contra o de três não
 * é comparação.
 */

type Partida = SeriesDetail['matches'][number];

export type TimeDaSerie = 'A' | 'B';

export interface JogadorNaSerie {
  playerId: string;
  player: { name: string };
  time: TimeDaSerie;
  /** A role que mais jogou; empate fica com a do primeiro jogo dele. */
  rolePlayed: Role;
  jogos: number;
  vitorias: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damageTaken: number;
  visionScore: number;
  cs: number;
  goldEarned: number;
  /** Minutos dos jogos dele com duração conhecida: a base dos por-minuto. */
  minutos: number;
  /** Na ordem dos jogos. */
  campeoes: string[];
  /** Jogou todos os jogos registrados da série. */
  completo: boolean;
}

type Acumulado = Omit<JogadorNaSerie, 'rolePlayed' | 'completo'> & { roles: Role[] };

export function kdaNaSerie(jogador: Pick<JogadorNaSerie, 'kills' | 'deaths' | 'assists'>): number {
  return (jogador.kills + jogador.assists) / Math.max(1, jogador.deaths);
}

/** Por minuto, ou null quando nenhum jogo dele trouxe a duração. */
export function porMinuto(total: number, minutos: number): number | null {
  return minutos > 0 ? total / minutos : null;
}

export function estatisticasDaSerie(partidas: readonly Partida[]): JogadorNaSerie[] {
  const jogadas = partidas
    .filter((partida) => partida.stats.length > 0)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (jogadas.length === 0) return [];

  const elencoA = elencoDoTimeA(jogadas);
  const acumulados = new Map<string, Acumulado>();
  for (const partida of jogadas) {
    const ladoA = ladoDoTimeA(partida.stats, elencoA);
    const minutos = partida.gameDurationSec ? partida.gameDurationSec / 60 : 0;
    for (const stat of partida.stats) {
      // O time sai do primeiro jogo em que ele aparece: o substituto do jogo 2
      // fica no time do lado em que entrou.
      const atual = acumulados.get(stat.playerId) ?? vazio(stat, stat.teamSide === ladoA);
      acumulados.set(stat.playerId, somar(atual, stat, minutos));
    }
  }

  return [...acumulados.values()]
    .map(({ roles, ...jogador }) => ({
      ...jogador,
      rolePlayed: maisJogada(roles),
      completo: jogador.jogos === jogadas.length,
    }))
    .sort(porTimeERole);
}

/** Selos da MD3: mesmas regras dos selos do jogo, só entre quem jogou todos. */
export function selosDaMd3(jogadores: readonly JogadorNaSerie[]): Map<string, SeloConquistado[]> {
  return selosDaSerie(
    jogadores.filter((jogador) => jogador.completo).map((j) => ({ ...j, firstBloodKill: false }))
  );
}

function vazio(stat: MatchStat, doTimeA: boolean): Acumulado {
  return {
    playerId: stat.playerId,
    player: { name: stat.player.name },
    time: doTimeA ? 'A' : 'B',
    jogos: 0,
    vitorias: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    damageTaken: 0,
    visionScore: 0,
    cs: 0,
    goldEarned: 0,
    minutos: 0,
    campeoes: [],
    roles: [],
  };
}

function somar(atual: Acumulado, stat: MatchStat, minutos: number): Acumulado {
  return {
    ...atual,
    jogos: atual.jogos + 1,
    vitorias: atual.vitorias + (stat.win ? 1 : 0),
    kills: atual.kills + stat.kills,
    deaths: atual.deaths + stat.deaths,
    assists: atual.assists + stat.assists,
    damage: atual.damage + stat.damage,
    damageTaken: atual.damageTaken + stat.damageTaken,
    visionScore: atual.visionScore + stat.visionScore,
    cs: atual.cs + stat.cs,
    goldEarned: atual.goldEarned + stat.goldEarned,
    minutos: atual.minutos + minutos,
    campeoes: [...atual.campeoes, stat.championName],
    roles: [...atual.roles, stat.rolePlayed],
  };
}

function maisJogada(roles: readonly Role[]): Role {
  const vezes = (role: Role) => roles.filter((r) => r === role).length;
  // `>` estrito: no empate fica a que apareceu primeiro.
  return roles.reduce((melhor, role) => (vezes(role) > vezes(melhor) ? role : melhor), roles[0]);
}

const ordemDaRole = (role: Role) => {
  const indice = ROLES.indexOf(role);
  return indice < 0 ? ROLES.length : indice;
};

function porTimeERole(a: JogadorNaSerie, b: JogadorNaSerie): number {
  return (
    a.time.localeCompare(b.time) ||
    ordemDaRole(a.rolePlayed) - ordemDaRole(b.rolePlayed) ||
    a.player.name.localeCompare(b.player.name)
  );
}
