import type { MatchStat } from '../types';
import { milhar } from './imagem/canvas';

/**
 * Selos da partida: quem foi o extremo de cada coisa NAQUELE jogo.
 *
 * Os selos do cliente do LoL (penta, sequência, first blood --
 * components/Highlights.tsx) dizem o que alguém fez. Estes comparam os dez
 * da mesma partida: mais dano, mais mortes, menos mortes... É a conversa de
 * fim de jogo ("quem deu mais dano?") respondida na própria linha.
 *
 * Duas regras seguram o valor do selo:
 *
 *   - Um vencedor só. Empate no topo = ninguém leva. Três jogadores com 2
 *     mortes não são "o que menos morreu", e um selo repartido não destaca.
 *
 *   - "Menos dano" ignora o suporte. Suporte dá menos dano por função; sem o
 *     corte, o selo seria sempre dele e deixaria de ser zoeira para virar
 *     acusação.
 *
 * Esta é a fonte única: a tela do Histórico e a imagem da partida usam a
 * mesma conta, então nunca discordam de quem ganhou o quê.
 */

export type SeloId =
  'maisDano' | 'paredao' | 'visao' | 'farm' | 'garcom' | 'intocavel' | 'maisMortes' | 'pacifista';

type Linha = Pick<
  MatchStat,
  'playerId' | 'rolePlayed' | 'damage' | 'damageTaken' | 'visionScore' | 'cs' | 'assists' | 'deaths'
>;

export interface Selo {
  id: SeloId;
  emoji: string;
  nome: string;
  /** Zoeira sai em vermelho, fora do ouro: não é mérito. */
  zoeira: boolean;
  /** O número que valeu o selo, já escrito para a tela. */
  descrever: (valor: number) => string;
}

interface Regra extends Selo {
  valor: (linha: Linha) => number;
  sentido: 'max' | 'min';
  elegivel?: (linha: Linha) => boolean;
}

// A ordem é a de exibição: os de mérito primeiro, a zoeira no fim.
const REGRAS: Regra[] = [
  {
    id: 'maisDano',
    emoji: '💥',
    nome: 'Mais dano',
    zoeira: false,
    descrever: (v) => `${milhar(v)} de dano, o maior do jogo`,
    valor: (l) => l.damage,
    sentido: 'max',
  },
  {
    id: 'paredao',
    emoji: '🛡️',
    nome: 'Paredão',
    zoeira: false,
    descrever: (v) => `segurou ${milhar(v)} de dano`,
    valor: (l) => l.damageTaken,
    sentido: 'max',
  },
  {
    id: 'visao',
    emoji: '👁️',
    nome: 'Olho no mapa',
    zoeira: false,
    descrever: (v) => `${v} de visão`,
    valor: (l) => l.visionScore,
    sentido: 'max',
  },
  {
    id: 'farm',
    emoji: '🌾',
    nome: 'Fazendeiro',
    zoeira: false,
    descrever: (v) => `${v} de farm`,
    valor: (l) => l.cs,
    sentido: 'max',
  },
  {
    id: 'garcom',
    emoji: '🤝',
    nome: 'Garçom',
    zoeira: false,
    descrever: (v) => `${v} assistências`,
    valor: (l) => l.assists,
    sentido: 'max',
  },
  {
    id: 'intocavel',
    emoji: '😇',
    nome: 'Intocável',
    zoeira: false,
    descrever: (v) =>
      v === 0 ? 'não morreu nenhuma vez' : `só ${v} ${v === 1 ? 'morte' : 'mortes'}`,
    valor: (l) => l.deaths,
    sentido: 'min',
  },
  {
    id: 'maisMortes',
    emoji: '💀',
    nome: 'Mais mortes',
    zoeira: true,
    descrever: (v) => `morreu ${v} vezes`,
    valor: (l) => l.deaths,
    sentido: 'max',
  },
  {
    id: 'pacifista',
    emoji: '🕊️',
    nome: 'Pacifista',
    zoeira: true,
    descrever: (v) => `${milhar(v)} de dano, o menor fora o suporte`,
    valor: (l) => l.damage,
    sentido: 'min',
    elegivel: (l) => l.rolePlayed !== 'SUPPORT',
  },
];

export const SELOS: readonly Selo[] = REGRAS.map(({ id, emoji, nome, zoeira, descrever }) => ({
  id,
  emoji,
  nome,
  zoeira,
  descrever,
}));

export interface SeloConquistado {
  selo: Selo;
  valor: number;
}

/**
 * Selos de cada jogador numa partida, na ordem de exibição.
 *
 * Partida sem o dado (colunas zeradas em importação antiga) não gera selo:
 * "mais visão" com todo mundo em 0 seria um empate de dez, e o "max > 0"
 * segura o caso de um só ter número.
 */
export function selosDaPartida(linhas: readonly Linha[]): Map<string, SeloConquistado[]> {
  const porJogador = new Map<string, SeloConquistado[]>();

  for (const regra of REGRAS) {
    const candidatos = linhas.filter((l) => regra.elegivel?.(l) ?? true);
    if (candidatos.length < 2) continue;

    const valores = candidatos.map(regra.valor);
    const alvo = regra.sentido === 'max' ? Math.max(...valores) : Math.min(...valores);
    if (regra.sentido === 'max' && alvo <= 0) continue;

    const vencedores = candidatos.filter((l) => regra.valor(l) === alvo);
    if (vencedores.length !== 1) continue;

    const [vencedor] = vencedores;
    const { valor: _valor, sentido: _sentido, elegivel: _elegivel, ...selo } = regra;
    const lista = porJogador.get(vencedor.playerId) ?? [];
    porJogador.set(vencedor.playerId, [...lista, { selo, valor: alvo }]);
  }

  return porJogador;
}

export interface Conquista extends SeloConquistado {
  playerId: string;
  nome: string;
}

/**
 * Os selos da partida em fila, na ordem de exibição, com o dono de cada um.
 * É a lista que a faixa do Histórico e o bloco da imagem mostram -- a mesma
 * função nos dois, para a ordem não divergir.
 */
export function conquistasEmOrdem(
  selos: ReadonlyMap<string, SeloConquistado[]>,
  linhas: readonly { playerId: string; player: { name: string } }[]
): Conquista[] {
  return SELOS.flatMap((selo) => {
    for (const [playerId, lista] of selos) {
      const achado = lista.find((conquista) => conquista.selo.id === selo.id);
      if (achado) {
        const nome = linhas.find((linha) => linha.playerId === playerId)?.player.name ?? '?';
        return [{ ...achado, playerId, nome }];
      }
    }
    return [];
  });
}
