import { Link } from 'react-router-dom';
import { Handshake } from 'lucide-react';
import { Avatar, Card, CardTitle } from './ui';
import type { DuplaNoPerfil, PlayerProfile } from '../types';

/**
 * Com quem a pessoa mais ganha e com quem mais perde no mesmo time.
 *
 * A regra de quem conta mora no servidor (lib/duplas.ts): três jogos juntos,
 * e o corte em 50% separa as duas listas. "Perde mais com" é zoeira, então sai
 * em `loss`, nunca em dourado -- dourado é mérito.
 */
export function Duplas({ duplas }: { duplas: PlayerProfile['duplas'] }) {
  const vazio = duplas.melhores.length === 0 && duplas.piores.length === 0;

  return (
    <Card title={<CardTitle icon={Handshake}>Duplas</CardTitle>}>
      {vazio ? (
        <p className="text-sm text-ink-faint">
          Aparece quem jogou pelo menos 3 partidas no mesmo time.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <ListaDeDuplas titulo="Ganha mais com" duplas={duplas.melhores} tom="text-win" />
          <ListaDeDuplas titulo="Perde mais com" duplas={duplas.piores} tom="text-loss" />
        </div>
      )}
    </Card>
  );
}

function ListaDeDuplas({
  titulo,
  duplas,
  tom,
}: {
  titulo: string;
  duplas: DuplaNoPerfil[];
  tom: string;
}) {
  return (
    <section aria-label={titulo} className="min-w-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
        {titulo}
      </h3>
      {duplas.length === 0 ? (
        <p className="text-sm text-ink-faint">Ninguém ainda.</p>
      ) : (
        <ul className="space-y-2">
          {duplas.map((dupla) => (
            <li key={dupla.parceiroId} className="flex min-w-0 items-center gap-2.5">
              <Avatar photoUrl={dupla.photoUrl} name={dupla.name} size="sm" />
              <span className="min-w-0 flex-1">
                <Link
                  to={`/jogadores/${dupla.parceiroId}`}
                  className="block truncate py-0.5 text-sm font-medium text-ink hover:text-gold"
                >
                  {dupla.name}
                </Link>
                <span className="block text-[11px] text-ink-faint">
                  {dupla.vitorias}–{dupla.jogos - dupla.vitorias} juntos
                </span>
              </span>
              <span className={`tabular shrink-0 text-sm font-bold ${tom}`}>
                {Math.round(dupla.winRate)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
