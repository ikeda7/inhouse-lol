import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Search, X } from 'lucide-react';
import { useChampions, normalizeChampionQuery } from '../hooks/useChampions';

interface ChampionPickerProps {
  value: string;
  onChange: (championName: string, championId: number | null) => void;
  /** Campeoes queimados no Fearless: aparecem bloqueados, nao somem da lista. */
  burned?: Set<string>;
  /** Ja escolhidos nesta partida (nao pode repetir campeao no mesmo jogo). */
  taken?: Set<string>;
  placeholder?: string;
}

/**
 * Combobox de campeao com icone oficial.
 *
 * Decisao: os campeoes bloqueados (queimados no Fearless ou ja escolhidos)
 * continuam VISIVEIS na lista, marcados e nao clicaveis. Escondê-los faria a
 * pessoa procurar um campeao que "sumiu" sem entender por quê -- e o motivo
 * do bloqueio é justamente a informacao que ela precisa ver.
 *
 * Se o Data Dragon estiver fora do ar, vira um input de texto livre: registrar
 * a partida e mais importante que ter o icone.
 */
export function ChampionPicker({
  value,
  onChange,
  burned,
  taken,
  placeholder = 'Campeao',
}: ChampionPickerProps) {
  const { manifest, loading, failed } = useChampions();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora. Sem isso, varias listas ficariam abertas ao mesmo
  // tempo numa tela com 10 pickers.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const results = useMemo(() => {
    const champions = manifest?.champions ?? [];
    const normalized = normalizeChampionQuery(query);
    const filtered = normalized
      ? champions.filter((champion) =>
          normalizeChampionQuery(champion.name).includes(normalized)
        )
      : champions;
    return filtered.slice(0, 60);
  }, [manifest, query]);

  const statusOf = (name: string): 'burned' | 'taken' | 'free' => {
    const key = name.toLowerCase();
    if (burned?.has(key)) return 'burned';
    if (taken?.has(key) && key !== value.toLowerCase()) return 'taken';
    return 'free';
  };

  const select = (name: string, key: number | null) => {
    onChange(name, key);
    setQuery('');
    setOpen(false);
  };

  if (failed) {
    return (
      <input
        value={value}
        onChange={(event) => onChange(event.target.value, null)}
        placeholder={`${placeholder} (digite)`}
        className="w-full rounded border border-hextech-700 bg-hextech-800/60 px-2 py-1.5 text-xs text-gold-300 placeholder:text-gold-400/30 focus:border-gold-400 focus:outline-none"
      />
    );
  }

  const selected = manifest?.champions.find(
    (champion) => champion.name.toLowerCase() === value.toLowerCase()
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 rounded border border-hextech-700 bg-hextech-800/60 px-2 py-1 focus-within:border-gold-400">
        {selected ? (
          <img
            src={selected.squareUrl}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0 rounded"
          />
        ) : (
          <Search size={14} className="shrink-0 text-gold-400/40" />
        )}

        <input
          value={open ? query : value}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const champion = results[highlight];
              if (champion && statusOf(champion.name) === 'free') {
                select(champion.name, champion.key);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={loading ? 'carregando...' : placeholder}
          className="w-full bg-transparent text-xs text-gold-300 placeholder:text-gold-400/30 focus:outline-none"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange('', null)}
            aria-label="Limpar campeao"
            className="shrink-0 text-gold-400/40 hover:text-gold-400"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-lg border border-hextech-700 bg-hextech-900 shadow-2xl"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-gold-400/50">Nenhum campeao encontrado.</li>
          )}

          {results.map((champion, index) => {
            const status = statusOf(champion.name);
            const blocked = status !== 'free';
            return (
              <li key={champion.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  disabled={blocked}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(champion.name, champion.key)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition ${
                    blocked
                      ? 'cursor-not-allowed opacity-40'
                      : index === highlight
                        ? 'bg-gold-400/15 text-gold-300'
                        : 'text-gold-300/80 hover:bg-hextech-800'
                  }`}
                >
                  <img
                    src={champion.squareUrl}
                    alt=""
                    width={22}
                    height={22}
                    loading="lazy"
                    className={`h-[22px] w-[22px] rounded ${blocked ? 'grayscale' : ''}`}
                  />
                  <span className="flex-1 truncate">{champion.name}</span>
                  {status === 'burned' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-orange-400">
                      <Ban size={11} />
                      queimado
                    </span>
                  )}
                  {status === 'taken' && (
                    <span className="text-[10px] font-semibold uppercase text-slate-400">
                      em uso
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
