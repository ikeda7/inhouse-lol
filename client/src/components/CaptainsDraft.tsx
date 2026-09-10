import { Crown } from 'lucide-react';
import { Button, ErrorState, RoleBadge } from './ui';
import type { CaptainsDraftState, DraftablePlayer, TeamSide } from '../types';

/**
 * O draft de capitães em andamento.
 *
 * A tela inteira gira em torno de UMA pergunta: de quem é a vez. Tudo aqui
 * serve a isso -- o time da vez fica aceso e o outro apagado, a fila mostra
 * onde estamos, e o pote é a única coisa clicável.
 *
 * O snake 1-2-2-2-1 é a parte que confunde ao vivo ("agora é minha de novo?").
 * Por isso a fila de escolhas aparece desenhada em vez de só o texto "vez do
 * azul": dá para ver que vêm duas seguidas antes de acontecer.
 */

interface Props {
  state: CaptainsDraftState;
  /** Quem escolher entra no time da vez. */
  onPick: (playerId: string) => void;
  escolhendo: boolean;
  erro: Error | null;
  onReiniciar: () => void;
  /** O rotulo muda entre "recomecar" (local) e "sair" (sala ao vivo). */
  reiniciarRotulo?: string;
  /**
   * So na sala ao vivo. Quando informado, quem nao e capitao do lado da vez
   * ve o pote em modo leitura -- e a razao de existir a trava.
   */
  podeEscolher?: boolean;
  /** Cabecalho de cada time na sala ao vivo (pegar/liberar o lado). */
  acoesDoTime?: (side: TeamSide) => React.ReactNode;
}

export function CaptainsDraft({
  state,
  onPick,
  escolhendo,
  erro,
  onReiniciar,
  reiniciarRotulo = 'Recomeçar o draft',
  podeEscolher = true,
  acoesDoTime,
}: Props) {
  const daVez = state.onTheClock;

  return (
    <div className="space-y-4">
      <FilaDeEscolhas state={state} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <ColunaDoTime side="BLUE" state={state} ativo={daVez === 'BLUE'} acoes={acoesDoTime} />

        <div className="order-first lg:order-none">
          <Pote
            state={state}
            onPick={onPick}
            escolhendo={escolhendo}
            desabilitado={state.finished || !podeEscolher}
            somenteLeitura={!podeEscolher && !state.finished}
          />
        </div>

        <ColunaDoTime side="RED" state={state} ativo={daVez === 'RED'} acoes={acoesDoTime} />
      </div>

      {erro && <ErrorState error={erro} />}

      <div className="flex justify-center">
        <Button variant="ghost" onClick={onReiniciar}>
          {reiniciarRotulo}
        </Button>
      </div>
    </div>
  );
}

/**
 * A fila snake desenhada.
 *
 * Cada quadradinho é uma escolha; a atual pulsa. Sem isso, "1-2-2-2-1" é uma
 * regra que alguém precisa lembrar de cabeça enquanto o draft acontece.
 *
 * "Já escolheu" é marcado no FUNDO, não apagando o número. O número é 11px em
 * azul ou vermelho: a `opacity-40` que estava aqui derrubava o contraste para
 * 2.0:1 (azul) e 1.8:1 (vermelho) sobre o overlay -- reprova AA por larga
 * margem e some na tela de quem estiver com brilho baixo. Cor de time em texto
 * pequeno só passa em opacidade cheia.
 */
function FilaDeEscolhas({ state }: { state: CaptainsDraftState }) {
  const fila = state.pickOrder ?? [];
  if (fila.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-line/40 bg-canvas/40 p-3">
      <span className="mr-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
        Ordem
      </span>
      {fila.map((pick) => {
        const jaFoi = pick.order < state.pickNumber;
        const agora = pick.order === state.pickNumber && !state.finished;

        return (
          <span
            key={pick.order}
            title={`Escolha ${pick.order} · time ${pick.side === 'BLUE' ? 'azul' : 'vermelho'}`}
            className={`tabular flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold transition ${
              pick.side === 'BLUE' ? 'text-blue' : 'text-red'
            } ${
              agora
                ? pick.side === 'BLUE'
                  ? 'bg-blue/25 ring-2 ring-blue'
                  : 'bg-red/25 ring-2 ring-red'
                : jaFoi
                  ? pick.side === 'BLUE'
                    ? 'bg-blue/15'
                    : 'bg-red/15'
                  : 'bg-overlay/60'
            }`}
          >
            {pick.order}
          </span>
        );
      })}
    </div>
  );
}

function ColunaDoTime({
  side,
  state,
  ativo,
  acoes,
}: {
  side: TeamSide;
  state: CaptainsDraftState;
  ativo: boolean;
  acoes?: (side: TeamSide) => React.ReactNode;
}) {
  const escolhidos = state.picks[side] ?? [];
  const capitao = state.captains[side];

  return (
    <div
      // O time da vez acende; o outro apaga. É o sinal mais forte da tela, e
      // por isso não compete com mais nada colorido aqui.
      className={`rounded-lg border p-3 transition ${
        ativo
          ? side === 'BLUE'
            ? 'border-blue/60 bg-blue/[0.06]'
            : 'border-red/60 bg-red/[0.06]'
          : 'border-line/50 bg-raised/30 opacity-70'
      }`}
    >
      <p
        className={`mb-2 flex items-center justify-between text-sm font-bold uppercase ${
          side === 'BLUE' ? 'text-blue' : 'text-red'
        }`}
      >
        {side === 'BLUE' ? 'Azul' : 'Vermelho'}
        {ativo && (
          <span className="animate-pulse rounded bg-gold/20 px-2 py-0.5 text-[10px] tracking-wide text-gold">
            é a vez
          </span>
        )}
        {!ativo && <span className="tabular text-xs text-ink-faint">{escolhidos.length}/5</span>}
      </p>

      {acoes && <div className="mb-2">{acoes(side)}</div>}

      <ul className="space-y-1.5">
        {escolhidos.map((jogador) => (
          <li
            key={jogador.id}
            className="flex items-center gap-2 rounded-md bg-canvas/50 px-2 py-1.5"
          >
            {jogador.id === capitao?.id && (
              <Crown size={13} className="shrink-0 text-gold" aria-label="capitão" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{jogador.name}</span>
          </li>
        ))}

        {/* Vagas vazias desenhadas: mostram quantas faltam sem precisar contar. */}
        {Array.from({ length: Math.max(0, 5 - escolhidos.length) }).map((_, index) => (
          <li
            key={`vazio-${index}`}
            className="rounded-md border border-dashed border-line/40 px-2 py-1.5 text-sm text-ink-faint"
          >
            —
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pote({
  state,
  onPick,
  escolhendo,
  desabilitado,
  somenteLeitura = false,
}: {
  state: CaptainsDraftState;
  onPick: (playerId: string) => void;
  escolhendo: boolean;
  desabilitado: boolean;
  /** Sala ao vivo: não é a vez de quem está olhando. O pote vira leitura. */
  somenteLeitura?: boolean;
}) {
  const restantes = [...state.available].sort((a, b) => a.name.localeCompare(b.name));

  if (state.finished) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-win/30 bg-win/[0.05] p-4 text-center">
        <p className="text-sm font-semibold text-win">
          Draft fechado. Os times estão montados abaixo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line/50 bg-raised/30 p-3">
      <p className="mb-2 flex items-center justify-between text-sm font-bold uppercase text-ink-muted">
        No pote
        <span className="tabular text-xs font-normal text-ink-faint">
          {somenteLeitura
            ? 'assistindo'
            : `${restantes.length} restante${restantes.length === 1 ? '' : 's'}`}
        </span>
      </p>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {restantes.map((jogador) => (
          <li key={jogador.id}>
            <BotaoDeEscolha
              jogador={jogador}
              onPick={onPick}
              desabilitado={desabilitado || escolhendo}
              lado={state.onTheClock}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BotaoDeEscolha({
  jogador,
  onPick,
  desabilitado,
  lado,
}: {
  jogador: DraftablePlayer;
  onPick: (playerId: string) => void;
  desabilitado: boolean;
  lado: TeamSide | null;
}) {
  return (
    <button
      onClick={() => onPick(jogador.id)}
      disabled={desabilitado}
      // A borda no hover é da cor de quem está escolhendo: confirma para onde o
      // jogador vai ANTES do clique, que é onde erro de draft ao vivo acontece.
      className={`w-full rounded-lg border border-line/60 bg-canvas/50 p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        lado === 'BLUE' ? 'hover:border-blue hover:bg-blue/10' : 'hover:border-red hover:bg-red/10'
      }`}
    >
      <p className="truncate text-sm font-medium">{jogador.name}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {jogador.roles.map((role, index) => (
          <RoleBadge key={role} role={role} primary={index === 0} />
        ))}
      </div>
    </button>
  );
}
