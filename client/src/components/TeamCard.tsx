import { Crown, Shuffle } from 'lucide-react';
import { ROLE_LABEL, type BalancedTeam } from '../types';

/**
 * Um dos dois times do sorteio, com as 5 posicoes na ordem canonica.
 *
 * O icone de shuffle marca quem foi alocado fora da main -- e a informacao que
 * a galera discute no grupo ("por que eu fui de sup de novo?"), entao ela
 * precisa estar visivel, nao escondida.
 */
export function TeamCard({ team, averageRating }: { team: BalancedTeam; averageRating?: boolean }) {
  const isBlue = team.side === 'BLUE';

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-lg ${
        isBlue ? 'border-blueside/50 bg-blueside/5' : 'border-redside/50 bg-redside/5'
      }`}
    >
      <header
        className={`flex items-center justify-between px-4 py-2 ${
          isBlue ? 'bg-blueside/20' : 'bg-redside/20'
        }`}
      >
        <h3 className="text-sm font-bold uppercase tracking-widest">
          {isBlue ? 'Time Azul' : 'Time Vermelho'}
        </h3>
        {averageRating && (
          <span className="text-xs text-gold-400/70" title="Rating medio do time">
            {team.averageRating}
          </span>
        )}
      </header>

      <ul className="divide-y divide-hextech-700/40">
        {team.players.map((entry) => (
          <li key={entry.player.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gold-400/70">
              {ROLE_LABEL[entry.role]}
            </span>

            <span className="flex-1 truncate font-medium">{entry.player.name}</span>

            {entry.preferenceIndex === 0 && !entry.isAutofill && (
              <Crown size={14} className="text-gold-400" aria-label="Role principal" />
            )}
            {entry.isAutofill && (
              <Shuffle
                size={14}
                className="text-slate-400"
                aria-label="Preencheu a vaga (Fill)"
              />
            )}
            {!entry.isAutofill && entry.preferenceIndex > 0 && (
              <span
                className="text-[10px] font-semibold text-amber-400/80"
                title={`${entry.preferenceIndex + 1}a opcao do pool`}
              >
                {entry.preferenceIndex + 1}a
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
