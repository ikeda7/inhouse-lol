import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { mostrarNaLista, useMenuFlutuante } from '../hooks/useMenuFlutuante';

export interface SelectOption {
  value: string;
  label: string;
  /** Some da lista? Não. Aparece marcado e não clicável -- ver comentário abaixo. */
  disabled?: boolean;
  /** Texto pequeno à direita, ex: "já escalado". */
  hint?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Marca visualmente como pendente (borda âmbar). */
  invalid?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Select próprio, no lugar do `<select>` nativo.
 *
 * O nativo não aceita estilo no menu: no Windows ele abre a lista branca do
 * sistema, com fonte do sistema, no meio de uma interface escura. É o que dava
 * a "cara de site antigo".
 *
 * Trocar por um customizado tem um custo real -- acessibilidade não vem de
 * graça. Então implementamos o que o nativo dava: navegação por setas, Home/End,
 * Enter/Espaço para abrir e escolher, Escape para fechar, busca por digitação,
 * `aria-activedescendant` para o leitor de tela acompanhar, e foco que volta
 * para o botão ao fechar.
 *
 * Opção desabilitada continua VISÍVEL e marcada. Esconder faria a pessoa
 * procurar um nome que "sumiu" -- e o motivo do bloqueio é justamente a
 * informação que ela precisa.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  invalid = false,
  ariaLabel,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typedRef = useRef({ termo: '', quando: 0 });
  const estilo = useMenuFlutuante(buttonRef, open, 180);
  const listaMontada = estilo !== null;

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const firstEnabled = useMemo(() => options.findIndex((option) => !option.disabled), [options]);

  useEffect(() => {
    if (!open) return;
    // A lista mora no body (ver useMenuFlutuante): clicar nela não é "fora".
    const onClickOutside = (event: MouseEvent) => {
      const alvo = event.target as Node;
      if (!containerRef.current?.contains(alvo) && !listRef.current?.contains(alvo)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Mantém a opção ativa visível numa lista longa, rolando só a lista. Depende
  // de `listaMontada` porque a lista só existe depois da posição calculada.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listaMontada) return;
    const lista = listRef.current;
    mostrarNaLista(
      lista,
      lista?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`) ?? null
    );
  }, [open, activeIndex, listaMontada]);

  const abrir = () => {
    const atual = options.findIndex((option) => option.value === value);
    setActiveIndex(atual >= 0 ? atual : firstEnabled);
    setOpen(true);
  };

  const fechar = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const escolher = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    fechar();
  };

  /** Anda para o próximo índice habilitado, pulando os bloqueados. */
  const mover = (delta: number) => {
    if (options.length === 0) return;
    let proximo = activeIndex;
    for (let i = 0; i < options.length; i++) {
      proximo = (proximo + delta + options.length) % options.length;
      if (!options[proximo].disabled) break;
    }
    setActiveIndex(proximo);
  };

  /** Digitar "ka" pula para "Kaio", como no select nativo. */
  const buscarDigitando = (tecla: string) => {
    const agora = Date.now();
    const estado = typedRef.current;
    estado.termo = agora - estado.quando > 700 ? tecla : estado.termo + tecla;
    estado.quando = agora;

    const alvo = options.findIndex(
      (option) =>
        !option.disabled && option.label.toLowerCase().startsWith(estado.termo.toLowerCase())
    );
    if (alvo >= 0) setActiveIndex(alvo);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        abrir();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        mover(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        mover(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabled);
        break;
      case 'End':
        event.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        escolher(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        fechar();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (event.key.length === 1) buscarDigitando(event.key);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={open && activeIndex >= 0 ? `opt-${activeIndex}` : undefined}
        onClick={() => (open ? fechar() : abrir())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition
          ${
            invalid
              ? 'border-warn/50 bg-warn/5'
              : open
                ? 'border-gold/60 bg-overlay'
                : 'border-line bg-raised hover:border-line/80 hover:bg-overlay/60'
          }`}
      >
        <span className={`flex-1 truncate ${selected ? 'text-ink' : 'text-ink-faint'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        estilo &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            style={estilo}
            className="surgir z-50 overflow-y-auto rounded-lg border border-line bg-overlay p-1 shadow-2xl shadow-black/60"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-xs text-ink-faint">Nenhuma opção.</li>
            )}

            {options.map((option, index) => {
              const ativo = index === activeIndex;
              const escolhido = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    id={`opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={escolhido}
                    disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    onClick={() => escolher(index)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition
                    ${
                      option.disabled
                        ? 'cursor-not-allowed text-ink-faint'
                        : ativo
                          ? 'bg-gold/15 text-ink'
                          : 'text-ink-muted'
                    }`}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">
                        {option.hint}
                      </span>
                    )}
                    {escolhido && <Check size={14} className="shrink-0 text-gold" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
