import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { linkDaSerie } from '../lib/links';

/**
 * A faixa no topo do ranking: a MD3 em andamento, ou o resultado da última.
 *
 * O ranking é a tela que todo mundo abre, e ela só falava do acumulado. A
 * pergunta de quem entra no dia seguinte à noite de jogo é "quanto ficou
 * ontem?", e a resposta estava a três toques (Histórico, abrir a série, ler).
 * A faixa responde e leva: para a Série, se a noite está rolando, ou para os
 * jogos da última.
 *
 * Enfeite da tela: sem série com jogo, ou se a busca falhar, não aparece nada.
 */
export function FaixaDaNoite() {
  const { data } = useAsync(() => seriesApi.list(5), []);
  // Em andamento tem prioridade mesmo sem jogo ainda; senão, a última COM jogo.
  const serie =
    data?.find((item) => item.status === 'ONGOING') ??
    data?.find((item) => item.matches.length > 0);
  if (!serie) return null;

  const aoVivo = serie.status === 'ONGOING';
  const nome = serie.name ?? new Date(serie.date).toLocaleDateString('pt-BR');
  const vencedor =
    serie.blueScore === serie.redScore
      ? null
      : serie.blueScore > serie.redScore
        ? serie.elencos.a
        : serie.elencos.b;

  return (
    <Link
      to={aoVivo ? '/serie' : linkDaSerie(serie.id)}
      className="group flex items-center gap-x-3 gap-y-1 rounded-lg border border-line/50 bg-raised/40 px-4 py-2.5 text-sm transition hover:bg-raised"
    >
      <span
        className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider ${
          aoVivo ? 'text-amber-400' : 'text-ink-faint'
        }`}
      >
        {aoVivo ? 'Em andamento' : 'Última noite'}
      </span>
      <span className="min-w-0 truncate font-semibold text-ink">{nome}</span>
      <span className="tabular shrink-0 font-bold text-ink">
        {serie.blueScore}
        <span className="mx-1 font-normal text-ink-faint">x</span>
        {serie.redScore}
      </span>
      {/* Só no desktop: no celular o nome e o placar já ocupam a linha. */}
      {!aoVivo && vencedor && vencedor.length > 0 && (
        <span className="hidden min-w-0 flex-1 truncate text-ink-muted md:block">
          venceram {vencedor.map((jogador) => jogador.name).join(', ')}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-muted transition group-hover:text-gold">
        {/* No celular fica só a seta: com o texto, o nome da noite era cortado
            em "Domingo …", e o nome é o que a faixa tem a dizer. */}
        <span className="sr-only sm:not-sr-only">{aoVivo ? 'acompanhar' : 'ver os jogos'}</span>
        <ArrowRight size={13} aria-hidden="true" />
      </span>
    </Link>
  );
}
