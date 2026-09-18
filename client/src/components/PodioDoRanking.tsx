import { Link } from 'react-router-dom';
import { Avatar } from './ui';
import type { LeaderboardEntry } from '../types';

/**
 * O pódio do ranking, como no quadro de medalhas da olimpíada: segundo à
 * esquerda, primeiro no meio e mais alto, terceiro à direita.
 *
 * A tabela continua com todo mundo, inclusive os três: o pódio é leitura de um
 * segundo -- quem está ganhando --, e a tabela é a conferência. Tirar os três
 * da tabela esconderia KDA, DPM e visão justamente de quem mais se olha.
 *
 * A altura do degrau é a única coisa que diz a ordem sem ler número, então ela
 * é proporcional de verdade (1º > 2º > 3º) e não decorativa.
 */

/** Ouro, prata e bronze pela posição. */
const MEDALHA = [
  {
    anel: 'ring-gold',
    texto: 'text-gold',
    degrau: 'h-24 sm:h-32',
    avatar: 'lg' as const,
    borda: 'border-t-gold',
  },
  {
    anel: 'ring-silver',
    texto: 'text-silver',
    degrau: 'h-16 sm:h-24',
    avatar: 'ml' as const,
    borda: 'border-t-silver',
  },
  {
    anel: 'ring-bronze',
    texto: 'text-bronze',
    degrau: 'h-11 sm:h-16',
    avatar: 'ml' as const,
    borda: 'border-t-bronze',
  },
];

export function PodioDoRanking({
  entries,
  rotuloDaMetrica,
  valorDaMetrica,
}: {
  entries: LeaderboardEntry[];
  /** Como a tabela está ordenada ("Vitórias", "KDA", ...). */
  rotuloDaMetrica: string;
  valorDaMetrica: (entry: LeaderboardEntry) => string;
}) {
  const tres = entries.slice(0, 3);
  // Com menos de três, pódio de olimpíada não existe -- e um degrau sozinho
  // parece bug. A tabela dá conta sozinha até o grupo ter três colocados.
  if (tres.length < 3) return null;

  // 2º, 1º, 3º: a ordem visual do pódio, não a da classificação.
  const ordemNaTela = [1, 0, 2];

  return (
    <div role="group" aria-label="Pódio" className="border-b border-line/40 px-3 pb-0 pt-5 sm:px-5">
      <div className="mx-auto flex max-w-2xl items-end justify-center gap-2 sm:gap-4">
        {ordemNaTela.map((posicao) => {
          const entry = tres[posicao];
          const medalha = MEDALHA[posicao];
          return (
            <div key={entry.playerId} className="flex min-w-0 flex-1 flex-col items-center">
              <Avatar
                photoUrl={entry.photoUrl}
                name={entry.name}
                size={medalha.avatar}
                className={`ring-2 ring-offset-2 ring-offset-surface ${medalha.anel}`}
              />

              <Link
                to={`/jogadores/${entry.playerId}`}
                className="mt-2 block max-w-full truncate text-[13px] font-semibold text-ink hover:text-gold sm:text-sm"
              >
                {entry.name}
              </Link>

              {/* O número que decide a ordem escolhida, e o rótulo por extenso:
                  "14" sozinho não diz se é vitória, KDA ou ponto. Dourado só no
                  primeiro: ouro marca quem decide a tela, não os três. */}
              <span
                className={`tabular text-xl font-bold leading-tight sm:text-3xl ${
                  posicao === 0 ? 'text-gold' : 'text-ink'
                }`}
              >
                {valorDaMetrica(entry)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                {rotuloDaMetrica}
              </span>

              <div
                className={`mt-2 flex w-full items-start justify-center rounded-t-md border-t-2 bg-raised pt-1.5 ${medalha.degrau} ${medalha.borda}`}
              >
                <span className={`tabular text-xl font-bold sm:text-3xl ${medalha.texto}`}>
                  {posicao + 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
