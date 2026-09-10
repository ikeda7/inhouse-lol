/**
 * DATA DRAGON
 *
 * CDN publico e gratuito da Riot com os assets oficiais (icones de campeao,
 * item, perfil). Nao precisa de API key e nao tem rate limit relevante, entao a
 * unica coisa que cacheamos e o catalogo de campeoes -- para poder traduzir
 * championId numerico -> nome de arquivo do icone.
 *
 * Pegadinha classica: o nome do ARQUIVO nem sempre e o nome do campeao.
 * "Wukong" e MonkeyKing.png, "Nunu & Willump" e Nunu.png, "Cho'Gath" e
 * Chogath.png. Por isso resolvemos sempre pelo catalogo, nunca por slugify.
 */

import { env } from './env.js';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

export interface ChampionEntry {
  /** Chave do Data Dragon, usada no nome do arquivo: "MonkeyKing". */
  id: string;
  /** championId numerico que vem do match-v5: 62. */
  key: number;
  /** Nome de exibicao no locale configurado: "Wukong". */
  name: string;
  title: string;
}

interface ChampionCatalog {
  version: string;
  fetchedAt: number;
  byKey: Map<number, ChampionEntry>;
  byId: Map<string, ChampionEntry>;
  byName: Map<string, ChampionEntry>;
  list: ChampionEntry[];
}

/** O catalogo muda a cada patch (~2 semanas). 6h de TTL e folgado. */
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

let catalogPromise: Promise<ChampionCatalog> | null = null;

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  if (!response.ok) {
    throw new Error(`Data Dragon: falha ao listar versoes (HTTP ${response.status}).`);
  }
  const versions = (await response.json()) as string[];
  return versions[0];
}

async function loadCatalog(): Promise<ChampionCatalog> {
  const version = await fetchLatestVersion();
  const url = `${DDRAGON_BASE}/cdn/${version}/data/${env.ddragonLocale}/champion.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Data Dragon: falha ao carregar campeoes (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as {
    data: Record<string, { id: string; key: string; name: string; title: string }>;
  };

  const byKey = new Map<number, ChampionEntry>();
  const byId = new Map<string, ChampionEntry>();
  const byName = new Map<string, ChampionEntry>();
  const list: ChampionEntry[] = [];

  for (const raw of Object.values(payload.data)) {
    const entry: ChampionEntry = {
      id: raw.id,
      key: Number(raw.key),
      name: raw.name,
      title: raw.title,
    };
    byKey.set(entry.key, entry);
    byId.set(entry.id.toLowerCase(), entry);
    byName.set(normalizeName(entry.name), entry);
    list.push(entry);
  }

  list.sort((a, b) => a.name.localeCompare(b.name));

  return { version, fetchedAt: Date.now(), byKey, byId, byName, list };
}

/** Tira acento, espaco e pontuacao: "Cho'Gath" e "chogath" batem. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export async function getChampionCatalog(): Promise<ChampionCatalog> {
  const cached = await catalogPromise?.catch(() => null);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return cached;
  }
  catalogPromise = loadCatalog();
  return catalogPromise;
}

/** Aceita championId numerico, chave DDragon ou nome exibido. */
export async function resolveChampion(input: number | string): Promise<ChampionEntry | null> {
  const catalog = await getChampionCatalog();
  if (typeof input === 'number') {
    return catalog.byKey.get(input) ?? null;
  }
  return catalog.byId.get(input.toLowerCase()) ?? catalog.byName.get(normalizeName(input)) ?? null;
}

export interface ChampionAsset {
  id: string;
  key: number;
  name: string;
  /** Icone quadrado 120x120, o que a UI usa nos cards e nos queimados. */
  squareUrl: string;
  /** Splash 1215x717, para o podio do perfil. */
  splashUrl: string;
  /** Loading screen 308x560. */
  loadingUrl: string;
}

export async function getChampionAsset(input: number | string): Promise<ChampionAsset | null> {
  const catalog = await getChampionCatalog();
  const champion = await resolveChampion(input);
  if (!champion) return null;

  return {
    id: champion.id,
    key: champion.key,
    name: champion.name,
    squareUrl: `${DDRAGON_BASE}/cdn/${catalog.version}/img/champion/${champion.id}.png`,
    splashUrl: `${DDRAGON_BASE}/cdn/img/champion/splash/${champion.id}_0.jpg`,
    loadingUrl: `${DDRAGON_BASE}/cdn/img/champion/loading/${champion.id}_0.jpg`,
  };
}

export async function getItemIconUrl(itemId: number): Promise<string> {
  const { version } = await getChampionCatalog();
  return `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`;
}

export async function getProfileIconUrl(iconId: number): Promise<string> {
  const { version } = await getChampionCatalog();
  return `${DDRAGON_BASE}/cdn/${version}/img/profileicon/${iconId}.png`;
}

/** Payload leve que o front consome uma vez e guarda em memoria. */
export async function getChampionManifest() {
  const catalog = await getChampionCatalog();
  return {
    version: catalog.version,
    locale: env.ddragonLocale,
    baseUrl: `${DDRAGON_BASE}/cdn/${catalog.version}`,
    champions: catalog.list.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      squareUrl: `${DDRAGON_BASE}/cdn/${catalog.version}/img/champion/${c.id}.png`,
    })),
  };
}
