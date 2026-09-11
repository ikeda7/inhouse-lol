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
 * Três regras seguram o valor do selo:
 *
 *   - Um vencedor só. Empate no topo = ninguém leva. Três jogadores com 2
 *     mortes não são "o que menos morreu", e um selo repartido não destaca.
 *
 *   - "Menos dano" ignora o suporte. Suporte dá menos dano por função; sem o
 *     corte, o selo seria sempre dele e deixaria de ser zoeira para virar
 *     acusação.
 *
 *   - Número PAR. A imagem do jogo mostra os selos em duas colunas, e um
 *     número ímpar deixava a última linha com um cartão sozinho. Quando isso
 *     acontece, entra o primeiro selo de RESERVA que tiver dono único. Se
 *     nenhum tiver, fica ímpar mesmo -- inventar selo empatado seria pior.
 *
 * Esta é a fonte única: a tela do Histórico e a imagem da partida usam a
 * mesma conta, então nunca discordam de quem ganhou o quê.
 */

export type SeloId =
  | 'maisDano'
  | 'paredao'
  | 'visao'
  | 'farm'
  | 'garcom'
  | 'intocavel'
  | 'maisMortes'
  | 'pacifista'
  | 'melhorKda'
  | 'maisAbates'
  | 'maisOuro'
  | 'firstBlood';

type Linha = Pick<
  MatchStat,
  | 'playerId'
  | 'rolePlayed'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'damage'
  | 'damageTaken'
  | 'visionScore'
  | 'cs'
  | 'goldEarned'
  | 'firstBloodKill'
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

const kda = (l: Linha) => (l.kills + l.assists) / Math.max(1, l.deaths);

/** Os selos de sempre, na ordem de exibição dos de mérito e depois a zoeira. */
const PRINCIPAIS: Regra[] = [
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

/**
 * Reservas: só entram para fechar um número par, na ordem desta lista. São de
 * mérito e fazem sentido sozinhas -- um "melhor KDA" é conversa de fim de jogo
 * tanto quanto "mais dano".
 */
const RESERVAS: Regra[] = [
  {
    id: 'melhorKda',
    emoji: '🎯',
    nome: 'Melhor KDA',
    zoeira: false,
    descrever: (v) => `KDA ${v.toFixed(2)}, o melhor do jogo`,
    valor: kda,
    sentido: 'max',
  },
  {
    id: 'maisAbates',
    emoji: '⚔️',
    nome: 'Mais abates',
    zoeira: false,
    descrever: (v) => `${v} abates`,
    valor: (l) => l.kills,
    sentido: 'max',
  },
  {
    id: 'maisOuro',
    emoji: '💰',
    nome: 'Mais ouro',
    zoeira: false,
    descrever: (v) => `${milhar(v)} de ouro`,
    valor: (l) => l.goldEarned,
    sentido: 'max',
  },
  {
    id: 'firstBlood',
    emoji: '🩸',
    nome: 'First blood',
    zoeira: false,
    descrever: () => 'abriu o placar da partida',
    valor: (l) => (l.firstBloodKill ? 1 : 0),
    sentido: 'max',
  },
];

/**
 * Onde o selo foi ganho: num jogo ou na MD3 inteira (issue #97). A regra é a
 * mesma -- um dono só, empate ninguém leva -- e só o texto muda.
 */
export type Escopo = 'jogo' | 'md3';

const TEXTO_NA_MD3: Partial<Record<SeloId, (valor: number) => string>> = {
  maisDano: (v) => `${milhar(v)} de dano, o maior da MD3`,
  melhorKda: (v) => `KDA ${v.toFixed(2)}, o melhor da MD3`,
};

/** First blood é fato de uma partida; somado na MD3 não diz nada. */
const SO_NO_JOGO: ReadonlySet<SeloId> = new Set<SeloId>(['firstBlood']);

function paraEscopo(regras: readonly Regra[], escopo: Escopo): Regra[] {
  if (escopo === 'jogo') return [...regras];
  return regras
    .filter((regra) => !SO_NO_JOGO.has(regra.id))
    .map((regra) => ({ ...regra, descrever: TEXTO_NA_MD3[regra.id] ?? regra.descrever }));
}

const semRegra = ({ id, emoji, nome, zoeira, descrever }: Regra): Selo => ({
  id,
  emoji,
  nome,
  zoeira,
  descrever,
});

/**
 * Ordem de exibição: mérito primeiro (os de sempre, depois as reservas) e a
 * zoeira no fim, como sempre foi.
 */
export const SELOS: readonly Selo[] = [
  ...PRINCIPAIS.filter((r) => !r.zoeira),
  ...RESERVAS,
  ...PRINCIPAIS.filter((r) => r.zoeira),
].map(semRegra);

const ORDEM = new Map(SELOS.map((selo, i) => [selo.id, i]));

export interface SeloConquistado {
  selo: Selo;
  valor: number;
}

/** O único dono de uma regra na partida, ou null (empate, sem dado, poucos candidatos). */
function aplicar(
  regra: Regra,
  linhas: readonly Linha[]
): { playerId: string; conquista: SeloConquistado } | null {
  const candidatos = linhas.filter((l) => regra.elegivel?.(l) ?? true);
  if (candidatos.length < 2) return null;

  const valores = candidatos.map(regra.valor);
  const alvo = regra.sentido === 'max' ? Math.max(...valores) : Math.min(...valores);
  if (regra.sentido === 'max' && alvo <= 0) return null;

  const vencedores = candidatos.filter((l) => regra.valor(l) === alvo);
  if (vencedores.length !== 1) return null;

  return {
    playerId: vencedores[0].playerId,
    conquista: { selo: semRegra(regra), valor: alvo },
  };
}

/**
 * Selos de cada jogador numa partida, na ordem de exibição.
 *
 * Partida sem o dado (colunas zeradas em importação antiga) não gera selo:
 * "mais visão" com todo mundo em 0 seria um empate de dez, e o "max > 0"
 * segura o caso de um só ter número.
 */
export function selosDaPartida(linhas: readonly Linha[]): Map<string, SeloConquistado[]> {
  return selosNoEscopo(linhas, 'jogo');
}

/**
 * Selos da MD3 inteira, sobre os totais de cada jogador. Quem disputa é
 * decisão de quem chama: `lib/serieStats` só passa quem jogou todos os jogos,
 * para um substituto de um jogo não perder "mais dano" por ter jogado menos.
 */
export function selosDaSerie(linhas: readonly Linha[]): Map<string, SeloConquistado[]> {
  return selosNoEscopo(linhas, 'md3');
}

function selosNoEscopo(linhas: readonly Linha[], escopo: Escopo): Map<string, SeloConquistado[]> {
  const ganhos = paraEscopo(PRINCIPAIS, escopo)
    .map((regra) => aplicar(regra, linhas))
    .filter((ganho): ganho is NonNullable<typeof ganho> => ganho !== null);

  if (ganhos.length % 2 === 1) {
    for (const regra of paraEscopo(RESERVAS, escopo)) {
      const ganho = aplicar(regra, linhas);
      if (ganho) {
        ganhos.push(ganho);
        break;
      }
    }
  }

  const porJogador = new Map<string, SeloConquistado[]>();
  for (const { playerId, conquista } of ganhos) {
    porJogador.set(playerId, [...(porJogador.get(playerId) ?? []), conquista]);
  }
  for (const [playerId, lista] of porJogador) {
    porJogador.set(
      playerId,
      [...lista].sort((a, b) => (ORDEM.get(a.selo.id) ?? 0) - (ORDEM.get(b.selo.id) ?? 0))
    );
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
