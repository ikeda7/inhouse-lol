import { useEffect, useState } from 'react';
import { riotApi } from '../api/client';
import type { ChampionManifest } from '../types';

/**
 * Catalogo de campeoes do Data Dragon.
 *
 * O manifesto tem ~170 campeoes e muda so a cada patch, mas varios componentes
 * precisam dele ao mesmo tempo (picker, queimados, podio). Um cache em modulo
 * garante UMA requisicao por sessao, em vez de uma por componente montado.
 */
let cache: ChampionManifest | null = null;
let inFlight: Promise<ChampionManifest> | null = null;

function loadManifest(): Promise<ChampionManifest> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = riotApi
      .champions()
      .then((manifest) => {
        cache = manifest;
        return manifest;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface ChampionsState {
  manifest: ChampionManifest | null;
  loading: boolean;
  /** O Data Dragon fora do ar nao pode travar o registro da partida. */
  failed: boolean;
}

export function useChampions(): ChampionsState {
  const [manifest, setManifest] = useState<ChampionManifest | null>(cache);
  const [loading, setLoading] = useState(cache === null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    loadManifest()
      .then((result) => {
        if (!cancelled) setManifest(result);
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

  return { manifest, loading, failed };
}

/** Tira acento e pontuacao: "Cho'Gath" acha com "chogath", "Kai'Sa" com "kaisa". */
export function normalizeChampionQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
