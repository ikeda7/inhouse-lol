import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Inbox } from 'lucide-react';
import { ApiError } from '../api/client';
import { ROLE_LABEL, type RoleInput } from '../types';

/**
 * Blocos compartilhados.
 *
 * Os três estados (carregando / erro / vazio) têm componente próprio para que
 * nenhuma tela "esqueça" de tratar algum deles.
 */

export function Card({
  title,
  action,
  children,
  className = '',
  padding = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Desligue quando o conteúdo controla o próprio respiro (tabela, lista). */
  padding?: boolean;
}) {
  return (
    <section
      className={`surgir overflow-hidden rounded-lg border border-line/60 bg-surface/80 backdrop-blur-sm ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-3 sm:px-5">
          {typeof title === 'string' ? (
            <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      <div className={padding ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

/** Título de seção com o mesmo peso em todo lugar. */
export function CardTitle({ icon: Icon, children }: { icon?: React.ElementType; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
      {Icon && <Icon size={15} className="text-gold" />}
      {children}
    </h2>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  const variants = {
    primary:
      'bg-gold text-base font-semibold hover:bg-gold/90 active:bg-gold/80 shadow-lg shadow-gold/10',
    ghost: 'border border-line text-ink-muted hover:border-gold/50 hover:text-ink',
    subtle: 'bg-raised text-ink-muted hover:bg-overlay hover:text-ink',
    danger: 'bg-red/15 text-red hover:bg-red/25',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
  };

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center rounded-md transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Campo de texto com o mesmo tratamento do Select. */
export function Input({
  label,
  invalid = false,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; invalid?: boolean }) {
  const campo = (
    <input
      {...props}
      className={`w-full rounded-md border px-3 py-2 text-sm text-ink transition placeholder:text-ink-faint/60 focus:outline-none ${
        invalid
          ? 'border-warn/50 bg-warn/5'
          : 'border-line bg-raised focus:border-gold/60 focus:bg-overlay'
      } ${className}`}
    />
  );

  if (!label) return campo;
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      {campo}
    </label>
  );
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-faint">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="rounded-full bg-raised p-3">
        <Inbox size={20} className="text-ink-faint" />
      </div>
      <p className="max-w-xs text-sm text-ink-faint">{label}</p>
      {action}
    </div>
  );
}

/**
 * Mostra a mensagem que a API mandou, não um "algo deu errado" genérico -- o
 * backend já explica o gargalo de roles, o Fearless violado, quem falta
 * vincular.
 */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const details = error instanceof ApiError ? error.details : undefined;

  return (
    <div className="rounded-lg border border-red/30 bg-red/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{error.message}</p>
          {Array.isArray(details) && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
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
              className="mt-2.5 text-xs font-semibold text-gold hover:underline"
            >
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ROLE_STYLE: Record<RoleInput, string> = {
  TOP: 'bg-amber-500/10 text-amber-300/90',
  JUNGLE: 'bg-emerald-500/10 text-emerald-300/90',
  MID: 'bg-sky-500/10 text-sky-300/90',
  ADC: 'bg-rose-500/10 text-rose-300/90',
  SUPPORT: 'bg-violet-500/10 text-violet-300/90',
  FILL: 'bg-slate-500/10 text-slate-300/90',
};

export function RoleBadge({
  role,
  primary = false,
  size = 'sm',
}: {
  role: RoleInput;
  /** Destaca a role principal (primeiro item do pool). */
  primary?: boolean;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      className={`inline-flex items-center rounded font-semibold uppercase tracking-wide ${ROLE_STYLE[role]} ${
        size === 'xs' ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      } ${primary ? 'ring-1 ring-gold/40' : ''}`}
      title={primary ? `${ROLE_LABEL[role]} (principal)` : ROLE_LABEL[role]}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

/** Número grande com rótulo -- usado em placar e métricas de perfil. */
export function Stat({
  label,
  value,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad' | 'blue' | 'red';
  size?: 'md' | 'lg';
}) {
  const tones = {
    neutral: 'text-ink',
    good: 'text-win',
    bad: 'text-loss',
    blue: 'text-blue',
    red: 'text-red',
  };
  return (
    <div>
      <p
        className={`tabular font-bold leading-none ${tones[tone]} ${size === 'lg' ? 'text-4xl' : 'text-xl'}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </p>
    </div>
  );
}
