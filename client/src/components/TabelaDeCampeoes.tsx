import { Link } from 'react-router-dom';
import { Swords } from 'lucide-react';
import { Card, CardTitle, EmptyState } from './ui';
import { ChampionIcon } from './ChampionIcon';
import type { EstatisticaDeCampeao } from '../types';

/**
 * O campeão em si, não a pessoa: quem é escolhido, quem é banido e quem ganha.
 *
 * Presença (pick + ban) é a coluna que ordena, e é a medida que o cenário
 * competitivo usa: um campeão banido toda noite é forte mesmo sem nunca ser
 * jogado -- olhar só o pick esconderia justamente os mais temidos.
 *
 * As colunas de média (KDA, dano/min) e o "quem mais joga" existem porque a
 * tabela só com jogos/bans deixava metade da largura vazia e não respondia a
 * pergunta seguinte, que é sempre "e é bom na mão de quem?".
 */
export function TabelaDeCampeoes({
  campeoes,
  partidas,
}: {
  campeoes: EstatisticaDeCampeao[];
  partidas: number;
}) {
  return (
    <Card
      padding={false}
      title={<CardTitle icon={Swords}>Campeões</CardTitle>}
      action={
        partidas > 0 && (
          <span className="text-[11px] text-ink-faint">
            sobre {partidas} {partidas === 1 ? 'partida' : 'partidas'}
          </span>
        )
      }
    >
      {campeoes.length === 0 ? (
        <div className="p-4">
          <EmptyState label="Nenhum campeão escolhido ou banido ainda." />
        </div>
      ) : (
        // A tabela é a única coisa que pode passar da largura da tela, e passa
        // dentro do próprio container -- a página nunca rola de lado.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-line/60 text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="px-3 py-2 text-left font-medium">Campeão</th>
                <th className="px-2 py-2 text-right font-medium" title="Escolhido ou banido">
                  Presença
                </th>
                <th className="px-2 py-2 text-right font-medium">Jogos</th>
                <th className="px-2 py-2 text-right font-medium">Bans</th>
                <th className="px-2 py-2 text-right font-medium">V–D</th>
                <th className="px-2 py-2 text-right font-medium">Vitórias</th>
                <th className="px-2 py-2 text-right font-medium">KDA</th>
                <th className="px-2 py-2 text-right font-medium" title="Dano por minuto">
                  DPM
                </th>
                <th className="px-3 py-2 text-left font-medium">Quem mais joga</th>
              </tr>
            </thead>
            <tbody>
              {campeoes.map((campeao) => (
                <tr key={campeao.championName} className="border-b border-line/30 last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <ChampionIcon championName={campeao.championName} size={26} />
                      <span className="truncate font-medium text-ink">{campeao.championName}</span>
                    </span>
                  </td>
                  <td className="tabular px-2 py-2 text-right font-semibold text-ink">
                    {campeao.presenca}%
                  </td>
                  <td className="tabular px-2 py-2 text-right text-ink-muted">
                    {campeao.partidas}
                  </td>
                  <td className="tabular px-2 py-2 text-right text-ink-muted">{campeao.bans}</td>
                  <td className="tabular px-2 py-2 text-right text-ink-muted">
                    {campeao.partidas === 0
                      ? '—'
                      : `${campeao.vitorias}–${campeao.partidas - campeao.vitorias}`}
                  </td>
                  <td className="tabular px-2 py-2 text-right">
                    {campeao.winRate === null ? (
                      // Só banido: o traço diz "não deu para jogar", que é
                      // diferente de 0% -- esse seria "jogou e perdeu tudo".
                      <span className="text-ink-faint" title="Só foi banido, nunca jogado">
                        —
                      </span>
                    ) : (
                      <span
                        className={campeao.winRate >= 50 ? 'font-semibold text-win' : 'text-loss'}
                      >
                        {campeao.winRate}%
                      </span>
                    )}
                  </td>
                  <td className="tabular px-2 py-2 text-right text-ink-muted">
                    {campeao.kda === null ? '—' : campeao.kda.toFixed(2)}
                  </td>
                  <td className="tabular px-2 py-2 text-right text-ink-muted">
                    {campeao.danoPorMinuto === null ? '—' : campeao.danoPorMinuto}
                  </td>
                  <td className="px-3 py-2">
                    {campeao.quemMaisJoga ? (
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <Link
                          to={`/jogadores/${campeao.quemMaisJoga.playerId}`}
                          className="truncate text-ink-muted hover:text-gold"
                        >
                          {campeao.quemMaisJoga.name}
                        </Link>
                        <span className="tabular shrink-0 text-[11px] text-ink-faint">
                          ×{campeao.quemMaisJoga.jogos}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
