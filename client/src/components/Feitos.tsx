import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { statsApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { CATEGORIA, MOMENTO } from '../lib/destaquesMeta';
import { linkDaSerie } from '../lib/links';
import type { MomentEntry, RecordEntry } from '../types';
import { Card, CardTitle } from './ui';

/**
 * Os feitos de um jogador: os recordes do grupo que são dele e quantas vezes
 * cada momento ("LEGENDARY", "CARREGOU", "OLHO NO MAPA") saiu com o nome dele.
 *
 * O perfil só tinha média -- KDA, dano por minuto, winrate. Média diz como a
 * pessoa joga em geral; o que se conta no zap é o dia em que ela fez 18 abates.
 * Esses feitos já existiam nos Destaques, mas espalhados entre todo mundo, e
 * não havia como ver "os do Fulano".
 *
 * Usa a mesma rota e os mesmos rótulos dos Destaques (lib/destaquesMeta), então
 * as duas telas nunca discordam. É enfeite do perfil: se a busca falhar, o
 * cartão não aparece.
 */
export function Feitos({ playerId }: { playerId: string }) {
  const { data } = useAsync(() => statsApi.highlights(), []);
  if (!data) return null;

  const recordes = data.recordes.filter((recorde) => recorde.playerId === playerId);
  const momentos = contarMomentos(data.momentos.filter((momento) => momento.playerId === playerId));

  return (
    <Card title={<CardTitle icon={Award}>Feitos</CardTitle>}>
      {recordes.length === 0 && momentos.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nenhum recorde nem momento ainda. Eles aparecem aqui conforme os jogos entram.
        </p>
      ) : (
        <div className="space-y-4">
          {recordes.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Recordes do grupo
              </h3>
              {/* `grid-cols-1` explícito e `min-w-0` no item: a coluna implícita
                  é `auto` e cresce até caber o texto inteiro, e o `truncate`
                  nunca corta (a verificação de telas pega isso com nome longo). */}
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recordes.map((recorde) => (
                  <li key={recorde.categoria} className="min-w-0">
                    <LinhaDeRecorde recorde={recorde} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {momentos.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Momentos
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {momentos.map((grupo) => (
                  <li key={grupo.titulo}>
                    <SeloDeMomento grupo={grupo} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

function ondeFoi(entrada: { seriesName: string | null; playedAt: string; matchNumber: number }) {
  const quando = entrada.seriesName ?? new Date(entrada.playedAt).toLocaleDateString('pt-BR');
  return `${quando} · Jogo ${entrada.matchNumber}`;
}

function LinhaDeRecorde({ recorde }: { recorde: RecordEntry }) {
  const meta = CATEGORIA[recorde.categoria];
  if (!meta) return null;
  const Icone = meta.icon;

  return (
    <Link
      to={linkDaSerie(recorde.seriesId, recorde.matchNumber)}
      aria-label={`${meta.label}: ${recorde.exibicao}, de ${recorde.championName}. ${ondeFoi(recorde)}: ver o jogo`}
      className="group flex items-center gap-2.5 rounded-lg border border-line/40 bg-raised/40 px-3 py-2 transition hover:bg-raised"
    >
      <Icone size={15} aria-hidden="true" className="shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink transition group-hover:text-gold">
          {meta.label}
        </span>
        <span className="block truncate text-[11px] text-ink-faint">
          {recorde.championName} · {ondeFoi(recorde)}
        </span>
      </span>
      {/* O mesmo critério do cartão dos Destaques: "mais mortes" não leva ouro. */}
      <span
        className={`tabular shrink-0 text-lg font-bold ${
          meta.tom === 'zoeira' ? 'text-loss' : 'text-gold'
        }`}
      >
        {recorde.exibicao}
      </span>
    </Link>
  );
}

interface GrupoDeMomentos {
  titulo: string;
  classe: string;
  vezes: number;
  /** O mais recente: é para o jogo dele que o selo leva. */
  ultimo: MomentEntry;
  peso: number;
}

/**
 * Junta os momentos pelo NOME que o jogo grita, não pelo tipo: sequência de 8
 * e de 10 são do mesmo tipo, mas uma é GODLIKE e a outra LEGENDARY, e é assim
 * que a pessoa conta. Do mais raro para o mais comum.
 */
function contarMomentos(momentos: MomentEntry[]): GrupoDeMomentos[] {
  const grupos = new Map<string, GrupoDeMomentos>();

  for (const momento of momentos) {
    const meta = MOMENTO[momento.tipo];
    if (!meta) continue;
    const titulo = meta.titulo(momento.valor);
    const atual = grupos.get(titulo);

    if (!atual) {
      grupos.set(titulo, {
        titulo,
        classe: meta.classe,
        vezes: 1,
        ultimo: momento,
        peso: momento.peso,
      });
      continue;
    }
    grupos.set(titulo, {
      ...atual,
      vezes: atual.vezes + 1,
      ultimo: momento.playedAt > atual.ultimo.playedAt ? momento : atual.ultimo,
      peso: Math.max(atual.peso, momento.peso),
    });
  }

  return [...grupos.values()].sort((a, b) => b.peso - a.peso || b.vezes - a.vezes);
}

function SeloDeMomento({ grupo }: { grupo: GrupoDeMomentos }) {
  const vezes = grupo.vezes === 1 ? 'uma vez' : `${grupo.vezes} vezes`;

  return (
    <Link
      to={linkDaSerie(grupo.ultimo.seriesId, grupo.ultimo.matchNumber)}
      title={`Última: ${ondeFoi(grupo.ultimo)}, de ${grupo.ultimo.championName}`}
      aria-label={`${grupo.titulo}, ${vezes}. Última: ${ondeFoi(grupo.ultimo)}: ver o jogo`}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold tracking-wide transition hover:brightness-125 ${grupo.classe}`}
    >
      {grupo.titulo}
      {grupo.vezes > 1 && <span className="tabular font-semibold opacity-80">×{grupo.vezes}</span>}
    </Link>
  );
}
