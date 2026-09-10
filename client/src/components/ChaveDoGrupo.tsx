import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { salvarChaveDoGrupo } from '../lib/chaveDoGrupo';

/**
 * Pede a chave do grupo dentro do ErrorState, quando o servidor recusou uma
 * escrita por falta dela.
 *
 * Fica no erro, e não num campo fixo em alguma tela, porque só quem tenta
 * gravar sem conta chega a precisar -- e é nesse momento que faz sentido
 * perguntar. Salva neste navegador e não pergunta de novo.
 */
export function PedirChaveDoGrupo({ onSalva }: { onSalva?: () => void }) {
  const [chave, setChave] = useState('');
  const [salva, setSalva] = useState(false);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!chave.trim()) return;
    salvarChaveDoGrupo(chave);
    setChave('');
    setSalva(true);
    onSalva?.();
  };

  return (
    <form onSubmit={enviar} className="mt-3 space-y-2">
      <p className="text-xs text-ink-muted">
        Quem é do grupo tem a chave (está no zap). Ou entre na sua conta.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="chave-do-grupo" className="sr-only">
          Chave do grupo
        </label>
        <input
          id="chave-do-grupo"
          type="password"
          autoComplete="off"
          value={chave}
          onChange={(evento) => setChave(evento.target.value)}
          placeholder="Chave do grupo"
          className="min-w-0 flex-1 rounded border border-line bg-raised px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded bg-gold px-2.5 py-1.5 text-xs font-semibold text-canvas"
        >
          <KeyRound size={12} />
          Salvar chave
        </button>
      </div>
      {salva && !onSalva && (
        <p className="text-xs text-ink-muted">Chave salva neste navegador. Repita a ação.</p>
      )}
    </form>
  );
}
