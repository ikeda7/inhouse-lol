import { Link } from 'react-router-dom';
import { ArrowRight, History } from 'lucide-react';
import { seriesApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { linkDaSerie } from '../lib/links';
import { Card, CardTitle } from './ui';
import { NaSerie } from './NaSerie';

/**
 * A última noite jogada, para a aba Série não ser um beco quando não há MD3.
 *
 * Seis dias por semana não há MD3 em andamento, e a aba mostrava só "nenhuma
 * MD3 em andamento" -- a tela mais vazia do site era a que tem o nome mais
 * convidativo. O que a pessoa quer ali, fora da noite de jogo, é o resultado
 * da última: placar, quem jogou, quem carregou, e o caminho para os jogos.
 *
 * É um enfeite da tela, não o assunto dela: se a busca falhar ou não houver
 * série com jogo, não aparece nada (e não vira tela de erro).
 */
export function UltimaNoite() {
  const ultima = useAsync(async () => {
    // A primeira série COM jogo: uma MD3 aberta por engano e descartada depois
    // não é "a última noite".
    const comJogo = (await seriesApi.list(5)).find((serie) => serie.matches.length > 0);
    return comJogo ? seriesApi.get(comJogo.id) : null;
  });

  const serie = ultima.data;
  if (!serie) return null;

  const nome = serie.name ?? new Date(serie.date).toLocaleDateString('pt-BR');

  return (
    <Card
      title={<CardTitle icon={History}>Última noite</CardTitle>}
      action={
        <Link
          to={linkDaSerie(serie.id)}
          className="-my-2 inline-flex items-center gap-1 py-2 text-xs font-semibold text-ink-muted hover:text-gold"
        >
          ver os jogos
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[17px] font-semibold text-ink">{nome}</p>
        {/* Time A x Time B, na ordem do placar; o bloco de baixo diz quem é quem. */}
        <p className="tabular shrink-0 text-2xl font-bold text-ink">
          {serie.blueScore}
          <span className="mx-1.5 text-base font-normal text-ink-faint">x</span>
          {serie.redScore}
        </p>
      </div>

      <NaSerie serie={serie} rotulo="A MD3 inteira" />
    </Card>
  );
}
