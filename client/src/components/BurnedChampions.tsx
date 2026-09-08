import { Flame } from 'lucide-react';
import type { BurnedChampion } from '../types';
import { Card, EmptyState } from './ui';

/**
 * FEARLESS DRAFT: campeoes indisponiveis para o resto da MD3.
 *
 * A imagem vem direto do CDN do Data Dragon (URL montada no backend, que sabe
 * a versao do patch). Grayscale + opacidade comunicam "queimado" sem depender
 * so de cor -- quem tiver dificuldade de distinguir cor ainda le o rotulo do
 * jogo (J1/J2) e o nome.
 */
export function BurnedChampions({
  burned,
  ddragonVersion,
}: {
  burned: BurnedChampion[];
  /** Fallback quando o item nao trouxe a URL pronta. */
  ddragonVersion?: string;
}) {
  const byMatch = burned.reduce<Record<number, BurnedChampion[]>>((acc, champion) => {
    const list = acc[champion.matchNumberWhenBurned] ?? [];
    return { ...acc, [champion.matchNumberWhenBurned]: [...list, champion] };
  }, {});

  const iconUrl = (champion: BurnedChampion) =>
    champion.ddragonId && ddragonVersion
      ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champion.ddragonId}.png`
      : null;

  return (
    <Card
      title={
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
          <Flame size={16} className="text-orange-400" />
          Campeoes queimados
        </h2>
      }
      action={
        <span className="text-xs text-ink-faint">
          {burned.length} indisponivel{burned.length === 1 ? '' : 'is'}
        </span>
      }
    >
      {burned.length === 0 ? (
        <EmptyState label="Nenhum campeao queimado ainda. O jogo 1 libera tudo." />
      ) : (
        <div className="space-y-4">
          {Object.entries(byMatch)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([matchNumber, champions]) => (
              <div key={matchNumber}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Queimados no jogo {matchNumber}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {champions.map((champion) => {
                    const url = iconUrl(champion);
                    return (
                      <li
                        key={champion.championName}
                        className="group relative"
                        title={`${champion.championName}${champion.player ? ` - ${champion.player.name}` : ''}`}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={champion.championName}
                            width={48}
                            height={48}
                            loading="lazy"
                            className="h-12 w-12 rounded border border-line opacity-40 grayscale transition group-hover:opacity-70"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded border border-line bg-raised text-[9px] opacity-50">
                            {champion.championName.slice(0, 6)}
                          </div>
                        )}
                        {/* Barra diagonal reforca o "bloqueado" para quem nao
                            distingue o grayscale. */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                          <span className="h-[2px] w-full rotate-45 bg-red/70" />
                        </span>
                        <span className="sr-only">{champion.championName} indisponivel</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
