import { useState, type ReactNode } from 'react';
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

/**
 * Cores do avatar sem foto (issue #3).
 *
 * Paleta propria de proposito: `gold` e acento, `blue`/`red` identificam TIME.
 * Pintar avatar com esses tokens diria uma coisa que nao e verdade -- um
 * jogador de avatar azul nao esta no time azul. Todos os tons abaixo passam
 * AA com o texto claro por cima.
 */
const CORES_DE_AVATAR = [
  'bg-slate-600',
  'bg-teal-700',
  'bg-indigo-700',
  'bg-cyan-800',
  'bg-violet-800',
  'bg-emerald-800',
];

function corDoNome(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CORES_DE_AVATAR[Math.abs(hash) % CORES_DE_AVATAR.length];
}

function iniciais(name: string): string {
  const partes = name.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const TAMANHO_DO_AVATAR = {
  sm: 'h-6 w-6 text-[9px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-24 w-24 text-2xl',
};

/**
 * Foto do jogador, com iniciais como fallback.
 *
 * Iniciais em vez de icone generico de pessoa: numa lista de 10, silhuetas
 * iguais nao distinguem ninguem -- "IK" distingue.
 */
export function Avatar({
  photoUrl,
  name,
  size = 'md',
  className = '',
}: {
  photoUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const base = `${TAMANHO_DO_AVATAR[size]} shrink-0 rounded-full ${className}`;

  // URL quebrada (icone do LoL que sumiu num patch) cai nas iniciais em vez
  // de mostrar o retangulo de imagem quebrada do navegador.
  if (photoUrl && !quebrou) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setQuebrou(true)}
        onLoad={() => setCarregou(true)}
        className={`${base} border border-line/60 bg-raised object-cover transition-opacity duration-300 ${
          carregou ? 'opacity-100' : 'opacity-0'
        }`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={name}
      className={`${base} ${corDoNome(name)} inline-flex items-center justify-center font-semibold tracking-wide text-white/90`}
    >
      {iniciais(name)}
    </span>
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
