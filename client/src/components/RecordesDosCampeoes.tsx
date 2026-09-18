import { Ban, Crown, Flame, Skull, ThumbsDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardTitle, EmptyState } from './ui';
import { ChampionIcon } from './ChampionIcon';
import type { RecordeDoCampeao } from '../types';

/**
 * Recordes DO CAMPEÃO -- não de quem jogou.
 *
 * "Quem mais ganha de Lux" é conversa de perfil; aqui o assunto é o campeão em
 * si: qual é escolhido, qual é banido, qual ganha. A regra mora no servidor
 * (lib/estatisticasDeCampeao.ts): winrate e KDA pedem 3 jogos, senão um 1–0
 * viraria "melhor campeão do grupo".
 */
const CATEGORIA: Record<string, { label: string; icon: LucideIcon; tom?: 'zoeira' }> = {
  maisEscolhido: { label: 'Mais escolhido', icon: Crown },
  maisBanido: { label: 'Mais banido', icon: Ban },
  maiorPresenca: { label: 'Maior presença', icon: Flame },
  melhorWinrate: { label: 'Mais vence', icon: TrendingUp },
  melhorKda: { label: 'Melhor KDA', icon: Skull },
  piorWinrate: { label: 'Mais perde', icon: ThumbsDown, tom: 'zoeira' },
};

export function RecordesDosCampeoes({ recordes }: { recordes: RecordeDoCampeao[] }) {
  return (
    <Card padding={false} title={<CardTitle icon={Crown}>Recordes de campeão</CardTitle>}>
      {recordes.length === 0 ? (
        <div className="p-4">
          <EmptyState label="Nenhum campeão escolhido ou banido ainda." />
        </div>
      ) : (
        <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {recordes.map((recorde) => (
            <CartaoDoCampeao key={recorde.categoria} recorde={recorde} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CartaoDoCampeao({ recorde }: { recorde: RecordeDoCampeao }) {
  const meta = CATEGORIA[recorde.categoria];
  if (!meta) return null;

  const Icone = meta.icon;

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line/40 bg-raised/40 p-3">
      <ChampionIcon championName={recorde.championName} size={44} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          <Icone size={12} />
          {meta.label}
        </p>
        <p className="truncate text-[15px] font-semibold text-ink">{recorde.championName}</p>
        {/* De onde o número saiu: "4 jogos · 3V–1D · 2 bans". Sem isso, "75%"
            não diz se veio de quatro partidas ou de quarenta. */}
        <p className="truncate text-[11px] text-ink-faint">{recorde.detalhe}</p>
      </div>

      <span
        className={`tabular shrink-0 text-2xl font-bold leading-none ${
          meta.tom === 'zoeira' ? 'text-loss' : 'text-gold'
        }`}
      >
        {recorde.exibicao}
      </span>
    </div>
  );
}
