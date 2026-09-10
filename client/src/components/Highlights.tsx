import type { MatchStat } from '../types';

/**
 * Selos de destaque na linha do jogador.
 *
 * O cliente do LoL já entrega multikill, killing spree e first blood prontos --
 * não é conta nossa, é o mesmo número que aparece na tela de fim de partida.
 *
 * O corte é proposital: se tudo virar selo, nada é destaque. Triple kill num
 * custom de 10 acontece toda partida, então só entra a partir de quadra. A
 * sequência entra a partir de 6 (Unstoppable pra cima) e o first blood é o mais
 * apagado dos três, porque é sorte de invade tanto quanto mérito.
 */

/** A partir de quantos abates seguidos a sequência merece selo. */
const MIN_SPREE = 6;
/** A partir de quantos abates de uma vez o multikill merece selo. */
const MIN_MULTIKILL = 4;

/** Rótulo que o próprio jogo usa para cada sequência. */
function nomeDaSequencia(spree: number): string {
  if (spree >= 8) return 'God-like';
  if (spree === 7) return 'Dominating';
  return 'Unstoppable';
}

interface HighlightsProps {
  stat: Pick<MatchStat, 'largestMultiKill' | 'largestKillingSpree' | 'firstBloodKill'>;
  /** No perfil do jogador o espaço é maior e cabe o texto por extenso. */
  verbose?: boolean;
}

export function Highlights({ stat, verbose = false }: HighlightsProps) {
  const multi = stat.largestMultiKill ?? 0;
  const spree = stat.largestKillingSpree ?? 0;
  const firstBlood = stat.firstBloodKill === true;

  const temAlgo = multi >= MIN_MULTIKILL || spree >= MIN_SPREE || firstBlood;
  if (!temAlgo) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {multi >= 5 && (
        <Selo tom="penta" titulo="Pentakill">
          {verbose ? '🔥 Pentakill' : '🔥 PENTA'}
        </Selo>
      )}
      {multi === 4 && (
        <Selo tom="quadra" titulo="Quadra kill">
          {verbose ? 'Quadra kill' : 'QUADRA'}
        </Selo>
      )}
      {spree >= MIN_SPREE && (
        <Selo tom="spree" titulo={`${nomeDaSequencia(spree)}: ${spree} abates sem morrer`}>
          {verbose ? `${nomeDaSequencia(spree)} (${spree})` : `⚔${spree}`}
        </Selo>
      )}
      {firstBlood && (
        <Selo tom="fb" titulo="First blood">
          {verbose ? 'First blood' : 'FB'}
        </Selo>
      )}
    </span>
  );
}

type Tom = 'penta' | 'quadra' | 'spree' | 'fb';

/**
 * Hierarquia por contraste, não por tamanho: penta é o único com anel, quadra
 * usa o ouro sem anel, sequência e first blood ficam em cinza. Assim a linha do
 * scoreboard não muda de altura quando alguém pentou.
 */
const TOM: Record<Tom, string> = {
  penta: 'bg-gold/20 text-gold ring-1 ring-gold/40',
  quadra: 'bg-gold/10 text-gold',
  spree: 'bg-overlay text-ink-muted',
  fb: 'bg-overlay text-ink-faint',
};

function Selo({ tom, titulo, children }: { tom: Tom; titulo: string; children: React.ReactNode }) {
  return (
    <span
      title={titulo}
      className={`tabular rounded px-1 py-px text-[9px] font-bold leading-tight tracking-wide ${TOM[tom]}`}
    >
      {/* O título vira texto acessível: leitor de tela ouve "Pentakill", não "PENTA". */}
      <span className="sr-only">{titulo}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}
