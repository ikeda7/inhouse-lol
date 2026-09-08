/**
 * Assets de build: itens, feiticos de invocador e runas.
 *
 * Fica separado de `ddragon.ts` (campeoes) porque sao tres catalogos com
 * formatos diferentes, e a tela de historico e a unica que precisa deles -- o
 * resto do app carrega so campeao.
 *
 * O front recebe UM manifesto e resolve tudo em memoria. A alternativa seria o
 * front bater no CDN por conta propria, mas ai cada scoreboard aberta faria 70
 * requisicoes de item e 10 de runa, sem cache compartilhado entre telas.
 *
 * Os tres catalogos sao pedidos em paralelo e o manifesto so falha se TODOS
 * falharem: item sem icone e um quadrado vazio, nao uma tela quebrada.
 */

import { env } from './env.js';
import { getChampionCatalog } from './ddragon.js';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

/** Mesmo TTL do catalogo de campeoes: os tres mudam junto, a cada patch. */
const TTL_MS = 6 * 60 * 60 * 1000;

export interface ItemEntry {
  id: number;
  name: string;
  /** Ouro total, para a tela poder ordenar a build por custo se quiser. */
  gold: number;
}

export interface SpellEntry {
  id: number;
  name: string;
  /** Nome do arquivo no CDN (ex: "SummonerFlash.png"). */
  image: string;
}

export interface RuneEntry {
  id: number;
  name: string;
  /** Caminho relativo do icone (ex: "perk-images/Styles/..."). */
  icon: string;
}

interface BuildCatalog {
  version: string;
  fetchedAt: number;
  items: ItemEntry[];
  spells: SpellEntry[];
  /** Keystones e as arvores, num mapa so -- a tela nao precisa da hierarquia. */
  runes: RuneEntry[];
}

let catalogPromise: Promise<BuildCatalog> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Data Dragon: HTTP ${response.status} em ${url}`);
  }
  return (await response.json()) as T;
}

async function loadItems(version: string): Promise<ItemEntry[]> {
  const payload = await fetchJson<{
    data: Record<string, { name: string; gold?: { total?: number } }>;
  }>(`${DDRAGON_BASE}/cdn/${version}/data/${env.ddragonLocale}/item.json`);

  return Object.entries(payload.data).map(([id, item]) => ({
    id: Number(id),
    name: item.name,
    gold: item.gold?.total ?? 0,
  }));
}

async function loadSpells(version: string): Promise<SpellEntry[]> {
  const payload = await fetchJson<{
    data: Record<string, { key: string; name: string; image: { full: string } }>;
  }>(`${DDRAGON_BASE}/cdn/${version}/data/${env.ddragonLocale}/summoner.json`);

  // A chave do objeto e o nome interno ("SummonerFlash"); o id numerico que o
  // scoreboard usa esta em `key`, como string.
  return Object.values(payload.data).map((spell) => ({
    id: Number(spell.key),
    name: spell.name,
    image: spell.image.full,
  }));
}

/**
 * `runesReforged.json` e uma arvore: estilos -> slots -> runas. A tela precisa
 * resolver id -> icone, entao achatamos, guardando tambem os estilos (que tem id
 * proprio e aparecem como o simbolo da arvore).
 */
async function loadRunes(): Promise<RuneEntry[]> {
  const styles = await fetchJson<
    {
      id: number;
      name: string;
      icon: string;
      slots: { runes: { id: number; name: string; icon: string }[] }[];
    }[]
    // runesReforged nao e versionado por patch na URL: o CDN serve o atual.
  >(`${DDRAGON_BASE}/cdn/${await versaoAtual()}/data/${env.ddragonLocale}/runesReforged.json`);

  const flat: RuneEntry[] = [];
  for (const style of styles) {
    flat.push({ id: style.id, name: style.name, icon: style.icon });
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        flat.push({ id: rune.id, name: rune.name, icon: rune.icon });
      }
    }
  }
  return flat;
}

async function versaoAtual(): Promise<string> {
  return (await getChampionCatalog()).version;
}

async function loadCatalog(): Promise<BuildCatalog> {
  const version = await versaoAtual();

  // allSettled em vez de all: se so o catalogo de runas cair, itens e feiticos
  // ainda aparecem. Um icone faltando e melhor que a scoreboard inteira vazia.
  const [items, spells, runes] = await Promise.allSettled([
    loadItems(version),
    loadSpells(version),
    loadRunes(),
  ]);

  if (items.status === 'rejected' && spells.status === 'rejected' && runes.status === 'rejected') {
    throw new Error('Data Dragon: nenhum catalogo de build respondeu.');
  }

  return {
    version,
    fetchedAt: Date.now(),
    items: items.status === 'fulfilled' ? items.value : [],
    spells: spells.status === 'fulfilled' ? spells.value : [],
    runes: runes.status === 'fulfilled' ? runes.value : [],
  };
}

export async function getBuildCatalog(): Promise<BuildCatalog> {
  const atual = catalogPromise ? await catalogPromise.catch(() => null) : null;
  if (atual && Date.now() - atual.fetchedAt < TTL_MS) return atual;

  catalogPromise = loadCatalog();
  return catalogPromise;
}

/**
 * Manifesto que o front consome uma vez por sessao.
 *
 * Manda os icones prontos como URL absoluta em vez de mandar so os ids e deixar
 * o front montar caminho: assim a regra de onde cada asset vive (item usa
 * versao, runa nao) fica num lugar so, aqui.
 */
export async function getBuildManifest() {
  const catalog = await getBuildCatalog();
  const base = `${DDRAGON_BASE}/cdn/${catalog.version}`;

  return {
    version: catalog.version,
    items: catalog.items.map((item) => ({
      id: item.id,
      name: item.name,
      gold: item.gold,
      iconUrl: `${base}/img/item/${item.id}.png`,
    })),
    spells: catalog.spells.map((spell) => ({
      id: spell.id,
      name: spell.name,
      iconUrl: `${base}/img/spell/${spell.image}`,
    })),
    runes: catalog.runes.map((rune) => ({
      id: rune.id,
      name: rune.name,
      // Runa NAO leva versao no caminho -- o CDN serve de /cdn/img/ direto.
      iconUrl: `${DDRAGON_BASE}/cdn/img/${rune.icon}`,
    })),
  };
}
