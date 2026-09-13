import { Crown, Shuffle } from 'lucide-react';
import { ROLE_LABEL, type BalancedTeam, type HistoricoNoSorteio } from '../types';

/**
 * Um dos dois times do sorteio, com as 5 posicoes na ordem canonica.
 *
 * O icone de shuffle marca quem foi alocado fora da main -- e a informacao que
 * a galera discute no grupo ("por que eu fui de sup de novo?"), entao ela
 * precisa estar visivel, nao escondida.
 *
 * Com `historico` (sorteio automático), o cabeçalho mostra a média do que o
 * sorteio CONSIDEROU -- não o KDA cru: um jogador com KDA 100 fazia um time
 * parelho parecer torto. Cada linha mostra o KDA do ranking, que é o número
 * que a pessoa reconhece, ou "novo" para quem nunca jogou.
 */
export function TeamCard({
  team,
  historico,
}: {
  team: BalancedTeam;
  historico?: Record<string, HistoricoNoSorteio>;
}) {
  const isBlue = team.side === 'BLUE';
  const considerados = historico
    ? team.players
        .map((entry) => historico[entry.player.id])
        .filter((doJogador): doJogador is HistoricoNoSorteio => Boolean(doJogador))
    : [];
  const media = (campo: 'kdaConsiderado' | 'winRateConsiderado') =>
    considerados.reduce((soma, doJogador) => soma + doJogador[campo], 0) / considerados.length;
  const kdaDaLinha = (doJogador: HistoricoNoSorteio | undefined) =>
    doJogador && doJogador.jogos > 0 ? 'KDA ' + doJogador.kda.toFixed(2) : 'novo';

  return (
    <div
      className={
        'overflow-hidden rounded-xl border shadow-lg ' +
        (isBlue ? 'border-blue/50 bg-blue/5' : 'border-red/50 bg-red/5')
      }
    >
      <header
        className={
          // flex-wrap: no celular "Time Vermelho" e a média do time não cabem
          // lado a lado, e cada um quebrava no meio ("TIME / VERMELHO").
          'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2 ' +
          (isBlue ? 'bg-blue/20' : 'bg-red/20')
        }
      >
        <h3 className="whitespace-nowrap text-sm font-bold uppercase tracking-widest">
          {isBlue ? 'Time Azul' : 'Time Vermelho'}
        </h3>
        {considerados.length > 0 && (
          <span
            className="tabular whitespace-nowrap text-xs text-ink-muted"
            title="O que o sorteio considerou: quem jogou pouco conta perto da média do grupo, e KDA tem teto"
          >
            KDA {media('kdaConsiderado').toFixed(2)} · {Math.round(media('winRateConsiderado'))}%
            vitórias
          </span>
        )}
      </header>

      <ul className="divide-y divide-line/40">
        {team.players.map((entry) => (
          <li key={entry.player.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {ROLE_LABEL[entry.role]}
            </span>

            <span className="flex-1 truncate font-medium">{entry.player.name}</span>

            {historico && (
              <span className="tabular shrink-0 text-[11px] text-ink-faint">
                {kdaDaLinha(historico[entry.player.id])}
              </span>
            )}
            {entry.preferenceIndex === 0 && !entry.isAutofill && (
              <Crown size={14} className="text-gold" aria-label="Role principal" />
            )}
            {entry.isAutofill && (
              <Shuffle size={14} className="text-slate-400" aria-label="Preencheu a vaga (Fill)" />
            )}
            {!entry.isAutofill && entry.preferenceIndex > 0 && (
              <span
                className="text-[10px] font-semibold text-amber-400/80"
                title={entry.preferenceIndex + 1 + 'a opcao do pool'}
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
