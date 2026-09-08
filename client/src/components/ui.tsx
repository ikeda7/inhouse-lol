import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Inbox } from 'lucide-react';
import { ApiError } from '../api/client';
import { ROLE_LABEL, type RoleInput } from '../types';

/**
 * Blocos de UI compartilhados. Os tres estados (carregando / erro / vazio) tem
 * componente proprio para que nenhuma tela "esqueca" de tratar algum deles.
 */

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-hextech-700/60 bg-hextech-900/70 p-4 shadow-lg ${className}`}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {typeof title === 'string' ? (
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gold-400">
              {title}
            </h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  const variants = {
    primary: 'bg-gold-400 text-hextech-950 hover:bg-gold-300 disabled:bg-gold-400/40',
    ghost:
      'border border-hextech-700 bg-transparent text-gold-300 hover:border-gold-400 hover:text-gold-400',
    danger: 'bg-redside/80 text-white hover:bg-redside',
  };

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gold-400/70">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sm text-gold-400/60">
      <Inbox size={22} />
      {label}
    </div>
  );
}

/**
 * Mostra a mensagem que a API mandou, nao um "algo deu errado" generico -- o
 * backend ja explica o gargalo de roles, o Fearless violado, etc.
 */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const details = error instanceof ApiError ? error.details : undefined;

  return (
    <div className="rounded-lg border border-redside/40 bg-redside/10 p-4 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-redside" />
        <div className="flex-1">
          <p className="font-medium text-gold-300">{error.message}</p>
          {Array.isArray(details) && (
            <ul className="mt-2 list-inside list-disc text-xs text-gold-400/70">
              {details.map((detail, i) => (
                <li key={i}>
                  {typeof detail === 'object' && detail !== null && 'message' in detail
                    ? String((detail as { message: unknown }).message)
                    : String(detail)}
                </li>
              ))}
            </ul>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-semibold text-gold-400 underline underline-offset-2"
            >
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ROLE_COLORS: Record<RoleInput, string> = {
  TOP: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  JUNGLE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MID: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  ADC: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  SUPPORT: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  FILL: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export function RoleBadge({
  role,
  primary = false,
}: {
  role: RoleInput;
  /** Destaca a role principal (primeiro item do pool). */
  primary?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_COLORS[role]} ${primary ? 'ring-1 ring-gold-400/50' : ''}`}
      title={primary ? `${ROLE_LABEL[role]} (principal)` : ROLE_LABEL[role]}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
