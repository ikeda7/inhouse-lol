import {
  Coins,
  Crosshair,
  Eye,
  Flame,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Timer,
  TrendingUp,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { nomeDaSequencia } from './lolTerms';
import type { MomentEntry, MomentType } from '../types';

/**
 * Como recordes e momentos se apresentam: rótulo, ícone, frase e cor.
 *
 * Morava dentro da página dos Destaques. Saiu quando o perfil passou a mostrar
 * os feitos de cada jogador: as duas telas têm de chamar a mesma coisa pelo
 * mesmo nome, e copiar a tabela era o caminho para uma dizer "LEGENDARY" e a
 * outra "Lendário".
 */

/** Categorias de recorde. `tom: 'zoeira'` tira o número do ouro (ver o cartão). */
export const CATEGORIA: Record<string, { label: string; icon: LucideIcon; tom?: 'zoeira' }> = {
  kills: { label: 'Mais abates', icon: Swords },
  kda: { label: 'Melhor KDA', icon: TrendingUp },
  damage: { label: 'Mais dano', icon: Flame },
  dpm: { label: 'Maior DPM', icon: Zap },
  spree: { label: 'Maior sequência', icon: Crosshair },
  assists: { label: 'Mais assistências', icon: Sparkles },
  cs: { label: 'Mais farm', icon: Wheat },
  gold: { label: 'Mais ouro', icon: Coins },
  damageTaken: { label: 'Mais dano sofrido', icon: Shield },
  vision: { label: 'Mais visão', icon: Eye },
  cc: { label: 'Mais controle', icon: Timer },
  deaths: { label: 'Mais mortes', icon: Skull, tom: 'zoeira' },
};

/**
 * Como cada tipo de momento se apresenta.
 *
 * `titulo` recebe o valor porque vários dependem dele -- a sequência vira
 * LEGENDARY ou RAMPAGE conforme o tamanho, não um rótulo fixo.
 *
 * `frase` é o que dá personalidade: sem ela o cartão é um número com nome do
 * lado, e a linha do tempo inteira lê igual.
 */
export const MOMENTO: Record<
  MomentType,
  {
    titulo: (valor: number) => string;
    frase: (m: MomentEntry) => string;
    classe: string;
    /** Só o topo da raridade ganha anel -- se tudo brilha, nada brilha. */
    destaque?: boolean;
  }
> = {
  PENTA: {
    titulo: () => 'PENTAKILL',
    frase: (m) => `derrubou o time inteiro de ${m.championName}`,
    classe: 'bg-gold/20 text-gold ring-1 ring-gold/50',
    destaque: true,
  },
  QUADRA: {
    titulo: () => 'QUADRA KILL',
    frase: (m) => `quatro de uma vez, de ${m.championName}`,
    classe: 'bg-gold/15 text-gold ring-1 ring-gold/30',
    destaque: true,
  },
  SPREE: {
    titulo: (v) => nomeDaSequencia(v),
    frase: (m) => `${m.valor} abates sem morrer uma vez`,
    classe: 'bg-warn/15 text-warn',
  },
  SEM_MORRER: {
    titulo: () => 'SEM MORRER',
    frase: (m) => `fechou o jogo em ${m.kills}/${m.deaths}/${m.assists}`,
    classe: 'bg-win/15 text-win',
  },
  CARRY: {
    titulo: () => 'CARREGOU',
    frase: (m) =>
      `maior dano da partida: ${Math.round(m.valor / 1000)}k` + (m.win ? '' : ' — e ainda perdeu'),
    classe: 'bg-red/15 text-red',
  },
  MURALHA: {
    titulo: () => 'MURALHA',
    frase: (m) => `segurou ${Math.round(m.valor / 1000)}k de dano na frente`,
    classe: 'bg-blue/15 text-blue',
  },
  VISAO: {
    titulo: () => 'OLHO NO MAPA',
    frase: (m) => `${m.valor} pontos de visão, o maior do jogo`,
    classe: 'bg-overlay text-ink-muted',
  },
  FARM: {
    titulo: () => 'FAZENDEIRO',
    frase: (m) => `${m.valor} de farm por minuto`,
    classe: 'bg-overlay text-ink-muted',
  },
  FIRST_BLOOD: {
    titulo: () => 'FIRST BLOOD',
    frase: () => 'abriu o placar da partida',
    classe: 'bg-overlay text-ink-faint',
  },
};
