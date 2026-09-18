import { Link } from 'react-router-dom';
import { Avatar } from './ui';
import { ChampionIcon } from './ChampionIcon';
import { ROLE_LABEL, type LeaderboardEntry } from '../types';

/**
 * O pódio do ranking, como no quadro de medalhas da olimpíada: segundo à
 * esquerda, primeiro no meio e mais alto, terceiro à direita.
 *
 * Cada degrau carrega TUDO o que a linha da tabela mostrava -- placar,
 * winrate, KDA, dano, farm, visão, MD3, pontos e os campeões --, e por isso os
 * três saem da lista de baixo. Antes o pódio só repetia o nome e o número, e
 * a mesma pessoa aparecia duas vezes na mesma tela: espaço gasto duas vezes
 * para dizer a mesma coisa.
 *
 * A altura do degrau é a única coisa que diz a ordem sem ler número, então ela
 * é proporcional de verdade (1º > 2º > 3º) e não decorativa.
 */

/**
 * Os degraus são altos o bastante para o número caber (o de 12px cortava o
 * "3" na borda do cartão) e diferentes o bastante para a ordem se ler de
 * longe: 64 / 48 / 36 no celular.
 */
const MEDALHA = [
  { anel: 'ring-gold', texto: 'text-gold', degrau: 'h-16 sm:h-20', borda: 'border-t-gold' },
  { anel: 'ring-silver', texto: 'text-silver', degrau: 'h-12 sm:h-14', borda: 'border-t-silver' },
  { anel: 'ring-bronze', texto: 'text-bronze', degrau: 'h-9 sm:h-10', borda: 'border-t-bronze' },
];

/** Quantos colocados o pódio tira da lista de baixo. */
export const TAMANHO_DO_PODIO = 3;

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
  const tres = entries.slice(0, TAMANHO_DO_PODIO);
  // Com menos de três, pódio de olimpíada não existe -- e um degrau sozinho
  // parece bug. A lista dá conta sozinha até o grupo ter três colocados.
  if (tres.length < TAMANHO_DO_PODIO) return null;

  // 2º, 1º, 3º: a ordem visual do pódio, não a da classificação.
  return (
    <div
      role="group"
      aria-label="Pódio"
      className="border-b border-line/40 px-2 pt-4 sm:px-4 sm:pt-5"
    >
      <div className="mx-auto flex max-w-4xl items-end justify-center gap-1.5 sm:gap-3">
        {[1, 0, 2].map((posicao) => (
          <DegrauDoPodio
            key={tres[posicao].playerId}
            entry={tres[posicao]}
            posicao={posicao}
            rotuloDaMetrica={rotuloDaMetrica}
            valorDaMetrica={valorDaMetrica}
          />
        ))}
      </div>
    </div>
  );
}

function DegrauDoPodio({
  entry,
  posicao,
  rotuloDaMetrica,
  valorDaMetrica,
}: {
  entry: LeaderboardEntry;
  posicao: number;
  rotuloDaMetrica: string;
  valorDaMetrica: (entry: LeaderboardEntry) => string;
}) {
  const medalha = MEDALHA[posicao];
  const primeiro = posicao === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <Avatar
        photoUrl={entry.photoUrl}
        name={entry.name}
        size={primeiro ? 'ml' : 'md'}
        className={`ring-2 ring-offset-2 ring-offset-surface ${medalha.anel}`}
      />

      <Link
        to={`/jogadores/${entry.playerId}`}
        className="mt-1.5 block max-w-full truncate text-[13px] font-semibold text-ink hover:text-gold sm:text-sm"
      >
        {entry.name}
      </Link>

      {/* O número que decide a ordem escolhida, com o rótulo por extenso: "43"
          sozinho não diz se é vitória, KDA ou ponto. Dourado só no primeiro --
          ouro marca quem decide a tela, não os três. */}
      <span
        className={`tabular text-xl font-bold leading-tight sm:text-2xl ${
          primeiro ? 'text-gold' : 'text-ink'
        }`}
      >
        {valorDaMetrica(entry)}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-ink-faint sm:text-[10px]">
        {rotuloDaMetrica}
      </span>

      <span className="mt-1 flex items-center gap-0.5">
        {entry.topChampions.slice(0, 3).map((champion) => (
          <ChampionIcon
            key={champion.championName}
            championName={champion.championName}
            size={20}
          />
        ))}
      </span>

      {/* Tudo o que a linha da tabela dizia, em linhas centralizadas e curtas.
          Rótulo à esquerda e valor à direita, como numa tabela, truncava o
          rótulo numa coluna de 120px ("V…", "VI…") e o número perdia o nome. */}
      <div className="tabular mt-1.5 flex flex-col items-center gap-px text-[10px] leading-tight text-ink-muted sm:text-[11px]">
        <span>
          <span className="text-ink">
            {entry.wins}–{entry.losses}
          </span>{' '}
          <span className={entry.winRate >= 50 ? 'text-win' : 'text-loss'}>{entry.winRate}%</span>
        </span>
        <span>KDA {entry.avgKda.toFixed(2)}</span>
        <span>
          DPM {Math.round(entry.avgDamagePerMinute)} · CS {entry.avgCsPerMinute.toFixed(1)}
        </span>
        <span>
          Visão {entry.avgVisionScore.toFixed(1)}
          {entry.seriesWon > 0 ? ` · 🏆${entry.seriesWon}` : ''}
        </span>
        <span className="font-bold text-gold">{entry.points} pts</span>
        {entry.mainRole && (
          <span className="text-[9px] uppercase tracking-wider text-ink-faint sm:text-[10px]">
            {ROLE_LABEL[entry.mainRole]}
          </span>
        )}
      </div>

      <div
        className={`mt-2 flex w-full items-center justify-center rounded-t-md border-t-2 bg-raised ${medalha.degrau} ${medalha.borda}`}
      >
        <span className={`tabular text-lg font-bold sm:text-2xl ${medalha.texto}`}>
          {posicao + 1}
        </span>
      </div>
    </div>
  );
}
