import { Link } from 'react-router-dom';
import { Repeat, Skull, Sparkles, Swords, Trophy, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardTitle, EmptyState } from './ui';
import { ChampionIcon } from './ChampionIcon';
import type { RecordeDeCampeao } from '../types';

/**
 * Recordes de campeão: o acumulado do par pessoa + campeão.
 *
 * Os recordes de cima são de UMA partida ("mais abates num jogo"); estes são
 * do histórico inteiro, que é o assunto que o grupo levanta sozinho ("fulano
 * só ganha de Lux"). A regra de quem entra mora no servidor
 * (lib/recordesDeCampeao.ts): winrate e KDA pedem 3 jogos com o campeão.
 */
const CATEGORIA: Record<string, { label: string; icon: LucideIcon; tom?: 'zoeira' }> = {
  campeaoMaisJogado: { label: 'Mais jogado', icon: Repeat },
  campeaoWinrate: { label: 'Mais vence com', icon: Trophy },
  campeaoKda: { label: 'Melhor KDA', icon: TrendingUp },
  campeaoKills: { label: 'Mais abates', icon: Swords },
  campeaoAssists: { label: 'Mais assistências', icon: Sparkles },
  campeaoMortes: { label: 'Mais mortes', icon: Skull, tom: 'zoeira' },
};

export function RecordesDeCampeao({ recordes }: { recordes: RecordeDeCampeao[] }) {
  return (
    <Card padding={false} title={<CardTitle icon={Trophy}>Com um campeão</CardTitle>}>
      {recordes.length === 0 ? (
        <div className="p-4">
          <EmptyState label="Ainda não deu para eleger ninguém com um campeão." />
        </div>
      ) : (
        <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {recordes.map((recorde) => (
            <CartaoDeCampeao key={recorde.categoria} recorde={recorde} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CartaoDeCampeao({ recorde }: { recorde: RecordeDeCampeao }) {
  const meta = CATEGORIA[recorde.categoria];
  if (!meta) return null;

  const Icone = meta.icon;
  const derrotas = recorde.jogos - recorde.vitorias;

  return (
    <Link
      to={`/jogadores/${recorde.playerId}`}
      // `min-w-0`: sem ele o item da grade cresce até caber o nome inteiro e o
      // `truncate` nunca corta -- o mesmo cuidado dos recordes de partida.
      className="group flex min-w-0 items-center gap-3 rounded-lg border border-line/40 bg-raised/40 p-3 transition hover:bg-raised"
    >
      <ChampionIcon championName={recorde.championName} size={44} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          <Icone size={12} />
          {meta.label}
        </p>
        <p className="truncate text-[15px] font-semibold text-ink transition group-hover:text-gold">
          {recorde.playerName}
        </p>
        {/* O campeão e o placar juntos: o número sozinho não diz de quantos
            jogos ele saiu, e é isso que separa recorde de sorte. */}
        <p className="truncate text-[11px] text-ink-faint">
          {recorde.championName} · {recorde.vitorias}V–{derrotas}D
        </p>
      </div>

      <span
        className={`tabular shrink-0 text-2xl font-bold leading-none ${
          meta.tom === 'zoeira' ? 'text-loss' : 'text-gold'
        }`}
      >
        {recorde.exibicao}
      </span>
    </Link>
  );
}
