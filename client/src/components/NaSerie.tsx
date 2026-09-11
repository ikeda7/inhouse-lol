import { ChampionIcon } from './ChampionIcon';
import { milhar } from '../lib/imagem/canvas';
import { conquistasEmOrdem } from '../lib/selos';
import {
  estatisticasDaSerie,
  kdaNaSerie,
  porMinuto,
  selosDaMd3,
  type JogadorNaSerie,
} from '../lib/serieStats';
import { ROLE_LABEL, type SeriesDetail } from '../types';

/**
 * A MD3 por jogador (issue #97): os jogos somados, um bloco por time.
 *
 * Time por ELENCO, como o placar -- quem trocou de lado continua no mesmo
 * time. Os selos da MD3 têm as regras dos selos do jogo e só contam quem
 * jogou todos os jogos (lib/serieStats); a imagem da série usa as mesmas
 * contas.
 *
 * Aparece em dois lugares: no Histórico, com a MD3 fechada, e na aba Série,
 * ao vivo, entre um jogo e outro -- por isso o rótulo vem de fora.
 */
export function NaSerie({
  serie,
  rotulo = 'A MD3 inteira',
}: {
  serie: SeriesDetail;
  rotulo?: string;
}) {
  const jogadores = estatisticasDaSerie(serie.matches);
  if (jogadores.length === 0) return null;

  const conquistas = conquistasEmOrdem(selosDaMd3(jogadores), jogadores);
  const totalDeJogos = serie.matches.filter((match) => match.stats.length > 0).length;
  const levou = (time: 'A' | 'B') =>
    serie.status === 'FINISHED' &&
    (time === 'A' ? serie.blueScore > serie.redScore : serie.redScore > serie.blueScore);

  return (
    <div
      role="region"
      aria-label={rotulo}
      // `@container`: as duas colunas de time dependem da largura DO BLOCO, não
      // da janela. No Histórico ele ocupa a tela; na Série, a coluna da
      // esquerda -- e ali dois times lado a lado quebravam cada linha em duas.
      className="@container rounded-lg border border-line/50 bg-raised/30 p-3 sm:p-4"
    >
      <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
        {rotulo}
        <span className="ml-2 font-normal normal-case tracking-normal">
          {totalDeJogos} {totalDeJogos === 1 ? 'jogo' : 'jogos somados'}
        </span>
      </p>

      {conquistas.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Selos da MD3">
          {conquistas.map(({ selo, valor, nome }) => (
            <li
              key={selo.id}
              title={selo.descrever(valor)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                selo.zoeira ? 'border-loss/30 bg-loss/10' : 'border-line/60 bg-raised/60'
              }`}
            >
              <span aria-hidden="true">{selo.emoji}</span>
              <span className={`font-semibold ${selo.zoeira ? 'text-loss' : 'text-ink'}`}>
                {selo.nome}
              </span>
              <span className="text-ink-muted">{nome}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid items-start gap-3 @4xl:grid-cols-2">
        {(['A', 'B'] as const).map((time) => (
          <div key={time} className="min-w-0 rounded-md border border-line/40 bg-canvas/40">
            <p className="flex items-center justify-between gap-2 border-b border-line/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Time {time}
              {levou(time) && (
                <span className="normal-case tracking-normal text-gold">🏆 levou a MD3</span>
              )}
            </p>
            <ul className="divide-y divide-line/30">
              {jogadores
                .filter((jogador) => jogador.time === time)
                .map((jogador) => (
                  <LinhaNaSerie
                    key={jogador.playerId}
                    jogador={jogador}
                    totalDeJogos={totalDeJogos}
                  />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Uma pessoa na MD3, em duas faixas: role, nome, campeões e K/D/A em cima; as
 * médias embaixo. Uma linha só não cabe a 390px sem espremer o nome.
 */
function LinhaNaSerie({
  jogador,
  totalDeJogos,
}: {
  jogador: JogadorNaSerie;
  totalDeJogos: number;
}) {
  const danoPorMinuto = porMinuto(jogador.damage, jogador.minutos);
  const csPorMinuto = porMinuto(jogador.cs, jogador.minutos);
  // Zero em dano, farm ou visão é importação antiga sem a coluna, não um jogo
  // sem dano: some da linha em vez de virar "0 dano/min" (a mesma leitura dos
  // selos, que não premiam coluna zerada).
  const detalhes = [
    `KDA ${kdaNaSerie(jogador).toFixed(2)}`,
    jogador.damage > 0 &&
      (danoPorMinuto === null
        ? `${milhar(jogador.damage)} de dano`
        : `${Math.round(danoPorMinuto)} dano/min`),
    jogador.cs > 0 &&
      (csPorMinuto === null ? `${jogador.cs} cs` : `${csPorMinuto.toFixed(1)} cs/min`),
    jogador.visionScore > 0 && `${jogador.visionScore} de visão`,
    // Aparece, mas avisado: os totais de quem entrou depois são de menos jogos.
    !jogador.completo && `jogou ${jogador.jogos} de ${totalDeJogos}`,
  ].filter(Boolean);

  return (
    <li className="px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          {ROLE_LABEL[jogador.rolePlayed]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {jogador.player.name}
        </span>
        <span className="flex shrink-0 gap-0.5">
          {jogador.campeoes.map((campeao, i) => (
            <ChampionIcon key={`${campeao}-${i}`} championName={campeao} size={20} />
          ))}
        </span>
        <span className="tabular w-[4.75rem] shrink-0 text-right text-sm font-semibold text-ink">
          {jogador.kills}/{jogador.deaths}/{jogador.assists}
        </span>
      </div>
      <p className="tabular mt-0.5 pl-14 text-[11px] text-ink-faint">{detalhes.join(' · ')}</p>
    </li>
  );
}
