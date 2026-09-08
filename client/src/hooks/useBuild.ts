import { useEffect, useState } from 'react';
import { riotApi } from '../api/client';
import type { BuildAsset, BuildManifest } from '../types';

/**
 * Catalogo de itens, feiticos e runas.
 *
 * Segue o mesmo desenho de `useChampions`: cache em modulo, uma requisicao por
 * sessao. A diferenca e o tamanho -- sao ~870 itens, e uma scoreboard aberta
 * resolve 70 icones de item de uma vez. Por isso o manifesto vira Map indexado
 * na primeira carga: com `.find()` numa lista de 870, cada scoreboard viraria
 * dezenas de milhares de comparacoes por render.
 */

export interface BuildIndex {
  version: string;
  item: (id: number) => (BuildAsset & { gold: number }) | undefined;
  spell: (id: number) => BuildAsset | undefined;
  rune: (id: number) => BuildAsset | undefined;
}

function indexar(manifest: BuildManifest): BuildIndex {
  const itens = new Map(manifest.items.map((entry) => [entry.id, entry]));
  const feiticos = new Map(manifest.spells.map((entry) => [entry.id, entry]));
  const runas = new Map(manifest.runes.map((entry) => [entry.id, entry]));

  return {
    version: manifest.version,
    item: (id) => itens.get(id),
    spell: (id) => feiticos.get(id),
    rune: (id) => runas.get(id),
  };
}

let cache: BuildIndex | null = null;
let inFlight: Promise<BuildIndex> | null = null;

function loadBuild(): Promise<BuildIndex> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = riotApi
      .build()
      .then((manifest) => {
        cache = indexar(manifest);
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface BuildState {
  build: BuildIndex | null;
  loading: boolean;
  /** CDN fora do ar nao pode esconder os numeros da partida. */
  failed: boolean;
}

export function useBuild(): BuildState {
  const [build, setBuild] = useState<BuildIndex | null>(cache);
  const [loading, setLoading] = useState(cache === null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    loadBuild()
      .then((result) => {
        if (!cancelled) setBuild(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { build, loading, failed };
}

/** Os 7 slots gravados em CSV. Slot vazio vem como 0. */
export function parseItems(csv: string | null): number[] | null {
  if (!csv) return null;
  return csv.split(',').map((parte) => Number(parte) || 0);
}
