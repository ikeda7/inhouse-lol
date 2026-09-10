#!/usr/bin/env node
/**
 * =============================================================================
 * InHouse LoL  --  Agente local
 * =============================================================================
 *
 * POR QUE ISSO EXISTE
 *
 * A API publica da Riot NAO lista custom games. O endpoint
 * `/lol/match/v5/matches/by-puuid/{puuid}/ids` so devolve filas oficiais, entao
 * nao existe "buscar meus ultimos inhouses" por la.
 *
 * Este agente usa as duas fontes que o SEU computador tem:
 *
 *  1. LCU (cliente do LoL aberto) -- historico proprio do cliente, onde os
 *     customs APARECEM. Usando o endpoint by-puuid da para cerca de 100
 *     partidas / ~1 mes (o endpoint current-summoner, mais obvio, e limitado a
 *     20 e engana: faz parecer que as partidas antigas sumiram).
 *
 *  2. Replays .rofl -- quando salvos, guardam o scoreboard completo para
 *     sempre. E o unico jeito de importar partida que ja saiu daquela janela.
 *
 * ---------------------------------------------------------------------------
 * COMO USAR
 *
 *   node companion/inhouse-companion.mjs --list       lista os customs por noite
 *   node companion/inhouse-companion.mjs --last       manda o custom mais recente
 *   node companion/inhouse-companion.mjs --watch      manda sozinho ao fim de cada jogo
 *   node companion/inhouse-companion.mjs --refresh-all atualiza as ja registradas
 *   node companion/inhouse-companion.mjs --game 123   manda um gameId especifico
 *
 *   node companion/inhouse-companion.mjs --replays      lista os replays salvos
 *   node companion/inhouse-companion.mjs --replay 123   importa de um replay
 *
 * Opcoes: --dry-run, --refresh, --api <url>, --series <id>, --interval <segundos>
 *
 * Requisitos: Node 18+ (usa fetch nativo). O cliente do LoL precisa estar
 * ABERTO para os comandos de historico -- os de replay leem arquivo em disco e
 * funcionam com o jogo fechado. Nao instala nada.
 *
 * NOTA DE SEGURANCA: o token do lockfile da acesso total ao cliente do LoL.
 * Ele fica so em memoria e nunca e enviado ao servidor -- so os dados da
 * partida sao. Nao commite lockfile nem cole o token em lugar nenhum.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const getOption = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const CONFIG = {
  apiUrl: (
    getOption('--api') ??
    process.env.INHOUSE_API_URL ??
    'http://localhost:3333/api'
  ).replace(/\/$/, ''),
  seriesId: getOption('--series') ?? process.env.INHOUSE_SERIES_ID ?? null,
  dryRun: hasFlag('--dry-run'),
  // Cadastra quem nao esta na base usando o nick, para uma partida antiga nao
  // ficar de fora so porque ninguem lembra de quem e aquele nick.
  autoCreate: hasFlag('--criar-faltantes'),
  // Reescreve a scoreboard de uma partida ja importada em vez de so avisar que
  // ela existe. E o caminho para preencher coluna nova (destaques) ou corrigir
  // role sem apagar a partida -- apagar levaria placar da MD3 e Fearless junto.
  refresh: hasFlag('--refresh'),
  pollIntervalMs: Number(getOption('--interval', '15')) * 1000,
};

const log = {
  info: (msg) => console.log(msg),
  ok: (msg) => console.log(`  OK  ${msg}`),
  warn: (msg) => console.log(`  !   ${msg}`),
  fail: (msg) => console.log(`  X   ${msg}`),
};

// ---------------------------------------------------------------------------
// Descoberta das credenciais do cliente
// ---------------------------------------------------------------------------

/**
 * O lockfile tem o formato:
 *   LeagueClient:<pid>:<porta>:<senha>:https
 *
 * Ele so existe enquanto o cliente esta aberto -- some ao fechar. Por isso a
 * leitura acontece a cada operacao, e nao uma vez no boot.
 */
function readLockfile() {
  const candidates = [
    process.env.LEAGUE_INSTALL_DIR && path.join(process.env.LEAGUE_INSTALL_DIR, 'lockfile'),
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    '/Applications/League of Legends.app/Contents/LoL/lockfile',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const [, , port, password] = readFileSync(candidate, 'utf8').split(':');
      if (port && password) return { port: Number(port), password };
    } catch {
      // Sem permissao ou arquivo travado: tenta o proximo caminho.
    }
  }
  return null;
}

/**
 * Plano B: extrair porta e senha da linha de comando do processo.
 *
 * Cobre instalacoes em disco/pasta fora do padrao, onde adivinhar o caminho do
 * lockfile nao funciona. O processo LeagueClientUx recebe `--app-port` e
 * `--remoting-auth-token` como argumentos.
 */
function readFromProcess() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process -Filter "name = \'LeagueClientUx.exe\'" | Select-Object -ExpandProperty CommandLine',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const port = output.match(/--app-port=(\d+)/)?.[1];
      const password = output.match(/--remoting-auth-token=([\w-]+)/)?.[1];
      if (port && password) return { port: Number(port), password };
    } else {
      const output = execFileSync('ps', ['x', '-o', 'args'], { encoding: 'utf8' });
      const line = output.split('\n').find((l) => l.includes('LeagueClientUx'));
      const port = line?.match(/--app-port=(\d+)/)?.[1];
      const password = line?.match(/--remoting-auth-token=([\w-]+)/)?.[1];
      if (port && password) return { port: Number(port), password };
    }
  } catch {
    // PowerShell bloqueado ou processo ausente.
  }
  return null;
}

function getCredentials() {
  const creds = readLockfile() ?? readFromProcess();
  if (!creds) {
    throw new Error(
      'Nao encontrei o cliente do LoL rodando.\n' +
        '      Abra o League of Legends e tente de novo.\n' +
        '      Se instalou em outro disco, defina LEAGUE_INSTALL_DIR apontando para a pasta.\n' +
        '      (Para importar de replay o cliente nao precisa estar aberto: use --replays.)'
    );
  }
  return creds;
}

// ---------------------------------------------------------------------------
// Cliente HTTP do LCU
// ---------------------------------------------------------------------------

/**
 * O cliente usa certificado autoassinado, entao `rejectUnauthorized: false` e
 * obrigatorio. E seguro aqui: a conexao e para 127.0.0.1, nao sai da maquina.
 * Por isso usamos `node:https` cru em vez de fetch -- da controle sobre o TLS.
 */
function lcuRequest(endpoint) {
  const { port, password } = getCredentials();
  const auth = Buffer.from(`riot:${password}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: endpoint,
        method: 'GET',
        rejectUnauthorized: false,
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null);
          if (res.statusCode >= 400) {
            return reject(new Error(`LCU respondeu HTTP ${res.statusCode} em ${endpoint}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Resposta invalida do LCU em ${endpoint}`));
          }
        });
      }
    );
    req.on('error', (error) =>
      reject(new Error(`Falha ao falar com o cliente do LoL: ${error.message}`))
    );
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Leitura do historico
// ---------------------------------------------------------------------------

const isCustom = (game) => game?.gameType === 'CUSTOM_GAME' || game?.queueId === 0;

/**
 * Historico do jogador. Diferente da API publica, INCLUI os customs.
 *
 * ATENCAO -- EXISTEM DOIS ENDPOINTS, E A DIFERENCA E ENORME:
 *
 *   .../products/lol/current-summoner/matches   -> teto de 20 jogos, IGNORA
 *                                                  begIndex (paginar devolve
 *                                                  sempre os mesmos 20)
 *   .../products/lol/{puuid}/matches            -> devolve ~100 jogos de uma
 *                                                  vez, cobrindo cerca de um mes
 *
 * Medido nesta maquina: o primeiro deu 20 jogos (2 customs), o segundo deu 101
 * jogos (13 customs) na mesma conta. Usar o `current-summoner` faz parecer que
 * partidas de duas semanas atras "sumiram" -- elas estao la, no outro endpoint.
 *
 * Por isso resolvemos o PUUID antes e usamos sempre a variante by-puuid.
 */
/** O PUUID nao muda durante a execucao; buscar uma vez basta. */
let puuidCache = null;

async function getPuuid() {
  if (!puuidCache) puuidCache = (await fetchCurrentSummoner())?.puuid ?? null;
  return puuidCache;
}

/**
 * @param {{ deep?: boolean }} options
 *   deep=true  varre o historico inteiro (para --list e --game)
 *   deep=false so a primeira pagina (para o --watch, que roda a cada 15s e so
 *              precisa saber qual foi a ultima partida)
 */
async function fetchRecentGames({ deep = true } = {}) {
  const puuid = await getPuuid();
  const collected = new Map();

  if (puuid) {
    // O `endIndex` alto nao aumenta o retorno alem do teto do servidor (~100),
    // mas paginar de 100 em 100 pega o que houver depois disso.
    const maxStart = deep ? 600 : 1;
    for (let start = 0; start < maxStart; start += 100) {
      const payload = await lcuRequest(
        `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${start}&endIndex=${start + 100}`
      );
      const page = payload?.games?.games ?? [];
      const novos = page.filter((game) => !collected.has(game.gameId));
      for (const game of page) collected.set(game.gameId, game);
      // Pagina sem novidade = fim do que o servidor entrega.
      if (novos.length === 0) break;
    }
  }

  // Rede de seguranca: se o by-puuid falhar (patch novo, conta sem puuid),
  // ainda pegamos as ultimas 20 pelo endpoint antigo.
  if (collected.size === 0) {
    const payload = await lcuRequest(
      '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20'
    );
    for (const game of payload?.games?.games ?? []) collected.set(game.gameId, game);
  }

  return [...collected.values()].sort((a, b) => (b.gameCreation ?? 0) - (a.gameCreation ?? 0));
}

/**
 * O resumo do historico traz so o participante do dono da conta.
 * O detalhe por gameId traz os 10, entao ele e obrigatorio antes de enviar.
 */
async function fetchGameDetail(gameId) {
  return lcuRequest(`/lol-match-history/v1/games/${gameId}`);
}

async function fetchCurrentSummoner() {
  return lcuRequest('/lol-summoner/v1/current-summoner');
}

/** Estado do jogo: None, Lobby, ChampSelect, InProgress, EndOfGame... */
async function fetchGameflowPhase() {
  const session = await lcuRequest('/lol-gameflow/v1/session');
  return session?.phase ?? 'None';
}

// ---------------------------------------------------------------------------
// Replays (.rofl)
//
// Para o LoL salvar sozinho:
//   Configuracoes > Replays > "Gravar automaticamente as partidas"
// ---------------------------------------------------------------------------

function replayFolders() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  return [
    process.env.LEAGUE_REPLAYS_DIR,
    path.join(home, 'Documents', 'League of Legends', 'Replays'),
    path.join(home, 'OneDrive', 'Documents', 'League of Legends', 'Replays'),
    path.join(home, 'OneDrive', 'Documentos', 'League of Legends', 'Replays'),
    path.join(home, 'Documentos', 'League of Legends', 'Replays'),
  ].filter(Boolean);
}

function listReplays() {
  const found = [];
  const seen = new Set();

  for (const folder of replayFolders()) {
    try {
      if (!existsSync(folder)) continue;
      for (const name of readdirSync(folder)) {
        if (!name.toLowerCase().endsWith('.rofl')) continue;
        const match = name.match(/^([A-Za-z0-9]+)[-_](\d+)\.rofl$/);
        if (!match || seen.has(name)) continue;
        seen.add(name);

        const full = path.join(folder, name);
        found.push({
          file: full,
          name,
          platformId: match[1].toUpperCase(),
          gameId: Number(match[2]),
          mtime: statSync(full).mtimeMs,
        });
      }
    } catch {
      // Pasta sem permissao: ignora e tenta a proxima.
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Extrai o bloco JSON de metadados do .rofl.
 *
 * Os offsets do header classico NAO valem no formato atual (magic "RIOT\x02"):
 * devolvem lixo -- verificado em arquivo real. Entao localizamos o bloco por
 * varredura, equilibrando chaves e ignorando as que estao dentro de string --
 * o proprio statsJson e uma string cheia de '{'.
 */
function extractRoflMetadata(buffer) {
  const anchor = buffer.indexOf(Buffer.from('"statsJson"', 'utf8'));
  if (anchor < 0) {
    throw new Error('Esse .rofl nao tem o bloco de estatisticas legivel.');
  }

  let start = anchor;
  while (start > 0 && buffer[start] !== 0x7b) start--;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;

  for (let i = start; i < buffer.length; i++) {
    const byte = buffer[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (byte === 0x5c) {
      escaped = true;
      continue;
    }
    if (byte === 0x22) {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (byte === 0x7b) depth++;
    else if (byte === 0x7d) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) throw new Error('Metadados do .rofl estao truncados.');
  return JSON.parse(buffer.subarray(start, end).toString('utf8'));
}

// ---------------------------------------------------------------------------
// Envio para o InHouse
// ---------------------------------------------------------------------------

async function postJson(endpoint, body) {
  const response = await fetch(`${CONFIG.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: `Resposta invalida (HTTP ${response.status})`,
  }));

  return { ok: response.ok && payload.success, payload };
}

const sendGame = (game, overrides = {}) =>
  postJson('/ingest/lcu', {
    game,
    seriesId: CONFIG.seriesId ?? undefined,
    dryRun: CONFIG.dryRun,
    autoCreatePlayers: CONFIG.autoCreate,
    refreshStats: CONFIG.refresh,
    ...overrides,
  });

const sendReplay = (entry) =>
  postJson('/ingest/rofl', {
    metadata: extractRoflMetadata(readFileSync(entry.file)),
    platformId: entry.platformId,
    gameId: entry.gameId,
    playedAtMs: entry.mtime,
    seriesId: CONFIG.seriesId ?? undefined,
    dryRun: CONFIG.dryRun,
    autoCreatePlayers: CONFIG.autoCreate,
    refreshStats: CONFIG.refresh,
  });

function describeResult({ ok, payload }) {
  if (ok) {
    const data = payload.data ?? {};

    if (data.refreshed) {
      log.ok(data.message ?? 'Estatisticas atualizadas.');
      return;
    }

    if (data.alreadyImported) {
      log.warn(data.message ?? 'Partida ja registrada.');
      return;
    }

    if (!data.saved) {
      log.ok('Preview gerado (dry-run) -- nada foi gravado.');
      const preview = data.preview;
      if (preview) {
        log.info(
          `      ${preview.winner} venceu · ${Math.round((preview.gameDurationSec ?? 0) / 60)} min`
        );
        for (const player of preview.players ?? []) {
          log.info(`        ${String(player.rolePlayed).padEnd(8)} ${player.championName}`);
        }
      }
      return;
    }

    log.ok(`Partida gravada! Placar da serie: ${data.series.blueScore}-${data.series.redScore}`);
    if (data.autoCreated?.length) {
      log.warn(`Cadastrei com o nick (renomeie depois): ${data.autoCreated.join(', ')}`);
    }
    if (data.autoLinked?.length) {
      log.info(`      Vinculei automaticamente: ${data.autoLinked.join(', ')}`);
    }
    if (data.rolesFullyInferred === false) {
      log.warn('A origem nao trouxe todas as posicoes; confira as roles no site.');
    }
    return;
  }

  log.fail(payload.error ?? 'Falha desconhecida.');

  if (payload.code === 'UNMATCHED_PARTICIPANTS') {
    log.info('      Preencha o Riot ID destes jogadores na tela "Jogadores":');
    for (const person of payload.details?.unmatched ?? []) {
      const who = person.riotId ?? person.summonerName ?? 'desconhecido';
      log.info(`        - ${who}${person.championName ? ` (${person.championName})` : ''}`);
    }
  }
  if (payload.code === 'NO_ONGOING_SERIES') {
    log.info('      Abra uma MD3 na aba Serie antes de importar.');
  }
  if (payload.code === 'FEARLESS_VIOLATION') {
    log.info('      Algum campeao dessa partida ja foi usado nessa MD3.');
  }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/** "07/09/2026, 21:17" -> agrupa por dia para a MD3 aparecer junta na lista. */
function diaDe(game) {
  return game.gameCreation ? new Date(game.gameCreation).toLocaleDateString('pt-BR') : '?';
}

async function commandList() {
  const summoner = await fetchCurrentSummoner();
  const account = `${summoner?.gameName ?? summoner?.displayName ?? '?'}#${summoner?.tagLine ?? '?'}`;
  log.info(`Conta: ${account}\n`);

  const games = await fetchRecentGames();
  const customs = games.filter(isCustom);

  const mais = games.length ? new Date(games[0].gameCreation) : null;
  const menos = games.length ? new Date(games.at(-1).gameCreation) : null;
  log.info(
    `Historico acessivel: ${games.length} partidas` +
      (mais && menos
        ? ` (${menos.toLocaleDateString('pt-BR')} a ${mais.toLocaleDateString('pt-BR')})`
        : '')
  );

  if (customs.length === 0) {
    log.warn('Nenhum custom game nesse historico.');
    log.info('      Partidas ainda mais antigas: veja --replays');
    return;
  }

  log.info(`\nCustom games (${customs.length}), agrupados por noite:\n`);

  let diaAnterior = null;
  for (const game of customs) {
    const dia = diaDe(game);
    if (dia !== diaAnterior) {
      const noite = customs.filter((g) => diaDe(g) === dia).length;
      log.info(`  ${dia}  (${noite} jogo${noite > 1 ? 's' : ''})`);
      diaAnterior = dia;
    }
    const hora = new Date(game.gameCreation).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    log.info(
      `     ${game.gameId}  ${hora}  ${String(Math.round((game.gameDuration ?? 0) / 60)).padStart(2)}min`
    );
  }

  log.info('\nImporte um com:  node companion/inhouse-companion.mjs --game <gameId>');
  log.info('Confira antes sem gravar acrescentando --dry-run');
}

async function commandSend(gameId) {
  let game;

  if (gameId) {
    game = await fetchGameDetail(gameId);
    if (!game) {
      throw new Error(
        `Partida ${gameId} nao esta no historico do cliente.\n` +
          '      Rode --list para ver o que esta disponivel.\n' +
          '      Se voce tem o replay dela, use: --replay ' +
          gameId
      );
    }
  } else {
    const customs = (await fetchRecentGames()).filter(isCustom);
    if (customs.length === 0) {
      throw new Error(
        'Nenhum custom game no historico do cliente.\n' +
          '      Rode --list para conferir. Para partidas mais antigas: --replays'
      );
    }
    game = (await fetchGameDetail(customs[0].gameId)) ?? customs[0];
  }

  log.info(`Enviando partida ${game.gameId}...`);
  describeResult(await sendGame(game));
}

async function commandReplays() {
  const replays = listReplays();

  if (replays.length === 0) {
    log.warn('Nenhum arquivo .rofl encontrado.');
    log.info('      Pastas procuradas:');
    for (const folder of replayFolders()) log.info(`        ${folder}`);
    log.info('');
    log.info('      Para o LoL salvar sozinho daqui pra frente:');
    log.info('        Configuracoes > Replays > "Gravar automaticamente as partidas"');
    log.info('      Se a pasta for outra, defina LEAGUE_REPLAYS_DIR.');
    return;
  }

  log.info(`Replays salvos (${replays.length}):`);
  for (const [index, replay] of replays.entries()) {
    log.info(
      `  [${index}] ${replay.name.padEnd(26)} ${new Date(replay.mtime).toLocaleString('pt-BR')}`
    );
  }
  log.info('\nImporte com:  node companion/inhouse-companion.mjs --replay <gameId>');
}

/**
 * Importa varios gameIds de uma vez.
 *
 * Existe porque a LISTAGEM do historico e limitada pelo cache do cliente (ver
 * `fetchRecentGames`), mas a BUSCA POR ID nao: `/games/{gameId}` responde para
 * qualquer partida que a conta jogou, inclusive de meses atras. Entao, sabendo
 * os ids, da para recuperar noites inteiras que nao aparecem no --list.
 */
/**
 * Atualiza a scoreboard de todas as partidas que JA estao registradas.
 *
 * Serve para quando o projeto passa a guardar um dado que a origem sempre soube
 * responder -- destaques, por exemplo. Varre o historico do cliente e reenvia
 * cada custom encontrado com refreshStats.
 *
 * E seguro varrer: o servidor recusa criar partida nova nesse modo, entao um
 * custom de um ano atras que apareca no caminho e pulado em vez de entrar de
 * carona na MD3 em andamento.
 */
async function commandRefreshAll() {
  // A LISTA do historico traz o resumo: so o SEU participante, nao os 10. Para
  // reenviar a partida e preciso o detalhe de cada uma (/games/<id>), senao o
  // servidor recebe 1 jogador e recusa com "esperava 10".
  const resumos = (await fetchRecentGames()).filter(isCustom);

  if (resumos.length === 0) {
    log.warn('Nenhum custom game no historico do cliente.');
    log.info('      Para partidas mais antigas: --replays\n');
    return;
  }

  log.info(`Encontrei ${resumos.length} custom(s) no historico. Atualizando as registradas...\n`);

  let atualizadas = 0;
  let puladas = 0;
  let recusadas = 0;

  for (const [index, resumo] of resumos.entries()) {
    const quando = new Date(resumo.gameCreation).toLocaleDateString('pt-BR');
    log.info(`[${index + 1}/${resumos.length}] ${resumo.gameId}  ${quando}`);

    try {
      const game = await fetchGameDetail(resumo.gameId);
      if (!game) {
        log.info('      detalhe indisponivel no cliente -- pulada');
        puladas++;
        continue;
      }

      const result = await sendGame(game, { refreshStats: true });
      const data = result.payload?.data ?? {};

      if (data.skipped) {
        // Nao esta no banco: nao e erro, so nao e assunto deste comando.
        log.info('      nao registrada -- pulada');
        puladas++;
      } else if (!result.ok) {
        // ARAM, treino contra bot, time incompleto: o servidor recusa por
        // regra, e a varredura segue. Nao e falha do comando.
        log.info(`      ${result.payload?.error ?? 'recusada'}`);
        recusadas++;
      } else {
        describeResult(result);
        if (data.refreshed) atualizadas++;
      }
    } catch (error) {
      log.fail(`  ${error.message.split('\n')[0]}`);
    }
  }

  log.info(
    `\nConcluido: ${atualizadas} atualizada(s), ${puladas} pulada(s), ${recusadas} recusada(s) por regra.`
  );
}

async function commandSendMany(idsCsv) {
  const ids = String(idsCsv ?? '')
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error('Passe os ids: --games 3279275628,3279294765,3279316571');
  }

  log.info(`Importando ${ids.length} partida(s)...\n`);

  let ok = 0;
  for (const [index, gameId] of ids.entries()) {
    log.info(`[${index + 1}/${ids.length}] partida ${gameId}`);
    try {
      const game = await fetchGameDetail(gameId);
      if (!game) {
        log.fail('  nao encontrada no historico da conta.');
        continue;
      }
      const result = await sendGame(game);
      describeResult(result);
      if (result.ok) ok++;
    } catch (error) {
      log.fail(`  ${error.message.split('\n')[0]}`);
    }
    log.info('');
  }

  log.info(`Concluido: ${ok}/${ids.length} enviadas com sucesso.`);
}

/**
 * Lista quem aparece nos seus custom games, com quantas vezes.
 *
 * Serve para preencher os Riot IDs no cadastro: quem joga o inhouse toda semana
 * aparece no topo, e e so casar cada Riot ID com o nome da pessoa na tela
 * "Jogadores". Sem esse vinculo a importacao recusa a partida.
 */
async function commandWho(idsCsv) {
  const explicitos = String(idsCsv ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ids = explicitos.length
    ? explicitos
    : (await fetchRecentGames()).filter(isCustom).map((g) => g.gameId);

  if (ids.length === 0) {
    log.warn('Nenhum custom game para analisar.');
    return;
  }

  log.info(`Analisando ${ids.length} custom game(s)...\n`);

  const contagem = new Map();
  for (const gameId of ids) {
    try {
      const game = await fetchGameDetail(gameId);
      for (const identity of game?.participantIdentities ?? []) {
        const player = identity.player ?? {};
        const chave =
          player.gameName && player.tagLine
            ? `${player.gameName}#${player.tagLine}`
            : (player.summonerName ?? '?');
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }
    } catch {
      // Partida indisponivel: nao impede o resto da analise.
    }
  }

  const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  log.info('Riot IDs que aparecem nos seus customs:\n');
  for (const [riotId, vezes] of ordenado) {
    log.info(`  ${String(vezes).padStart(2)}x  ${riotId}`);
  }
  log.info('\nCopie esses Riot IDs para o campo correspondente em "Jogadores".');
  log.info('Depois disso a importacao reconhece todo mundo sozinha.');
}

async function commandSendReplay(gameIdOrPath) {
  const replays = listReplays();
  const entry = gameIdOrPath
    ? replays.find(
        (replay) => String(replay.gameId) === String(gameIdOrPath) || replay.file === gameIdOrPath
      )
    : replays[0];

  if (!entry) {
    throw new Error(
      gameIdOrPath
        ? `Nao achei o replay ${gameIdOrPath}. Rode --replays para ver os disponiveis.`
        : 'Nenhum replay disponivel. Rode --replays para detalhes.'
    );
  }

  log.info(`Lendo replay ${entry.name}...`);
  describeResult(await sendReplay(entry));
}

/**
 * Modo vigia: acompanha o estado do cliente e envia sozinho quando um custom
 * termina.
 *
 * O gatilho e a TRANSICAO para EndOfGame (e nao "estar em EndOfGame"), senao o
 * mesmo jogo seria reenviado a cada ciclo enquanto a tela de fim de partida
 * estivesse aberta. O servidor tambem e idempotente, mas evitar o barulho e
 * melhor que depender disso.
 */
async function commandWatch() {
  log.info('Modo vigia ligado. Deixe rodando durante a noite de jogos.');
  log.info(`API: ${CONFIG.apiUrl}  ·  intervalo: ${CONFIG.pollIntervalMs / 1000}s`);
  log.info('Ctrl+C para sair.\n');

  let previousPhase = null;
  const alreadySent = new Set();

  for (;;) {
    try {
      const phase = await fetchGameflowPhase();

      if (phase !== previousPhase) {
        log.info(`[${new Date().toLocaleTimeString('pt-BR')}] estado: ${phase}`);
        previousPhase = phase;
      }

      if (phase === 'EndOfGame' || phase === 'PreEndOfGame') {
        // Aqui so interessa a partida que acabou: uma pagina resolve.
        const customs = (await fetchRecentGames({ deep: false })).filter(isCustom);
        const latest = customs[0];

        if (latest && !alreadySent.has(latest.gameId)) {
          alreadySent.add(latest.gameId);
          log.info(`Partida ${latest.gameId} terminou. Enviando...`);
          const detail = (await fetchGameDetail(latest.gameId)) ?? latest;
          describeResult(await sendGame(detail));
        }
      }
    } catch (error) {
      // Cliente fechado no meio da noite nao pode derrubar o vigia.
      if (previousPhase !== 'OFFLINE') {
        log.warn(error.message.split('\n')[0]);
        previousPhase = 'OFFLINE';
      }
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.pollIntervalMs));
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

async function main() {
  log.info('\n=== InHouse LoL · agente local ===\n');

  // Confere o servidor antes de mexer no cliente: erra mais rapido e com
  // mensagem melhor se o back nao estiver de pe.
  try {
    const status = await fetch(`${CONFIG.apiUrl}/ingest/status`).then((r) => r.json());
    const ongoing = status?.data?.ongoingSeries;
    log.info(
      ongoing
        ? `MD3 em andamento: ${ongoing.name ?? ongoing.id.slice(0, 8)} (${ongoing.blueScore}-${ongoing.redScore})`
        : 'Nenhuma MD3 aberta -- abra uma na aba Serie antes de importar.'
    );
    log.info(
      `Jogadores vinculados: ${status?.data?.linkedPlayers ?? 0}/${status?.data?.totalPlayers ?? 0}\n`
    );
  } catch {
    log.fail(`Nao consegui falar com o InHouse em ${CONFIG.apiUrl}`);
    log.info('      O servidor esta rodando? (npm run dev)\n');
    process.exit(1);
  }

  if (hasFlag('--replays')) return commandReplays();
  if (hasFlag('--replay')) return commandSendReplay(getOption('--replay'));
  if (hasFlag('--who')) return commandWho(getOption('--who'));
  if (hasFlag('--refresh-all')) return commandRefreshAll();
  if (hasFlag('--games')) return commandSendMany(getOption('--games'));
  if (hasFlag('--list')) return commandList();
  if (hasFlag('--watch')) return commandWatch();
  if (hasFlag('--game')) return commandSend(getOption('--game'));
  if (hasFlag('--last')) return commandSend(null);

  log.info('Do cliente do LoL (precisa estar aberto):');
  log.info('  --list             lista os customs que o cliente tem em cache');
  log.info('  --last             envia o custom mais recente');
  log.info('  --game <id>        envia um gameId especifico');
  log.info('  --games <id,id>    envia varios de uma vez');
  log.info('  --refresh-all      atualiza a scoreboard de todas as ja registradas');
  log.info('  --watch            envia sozinho ao fim de cada jogo');
  log.info('  --who [ids]        mostra os Riot IDs de quem joga os customs');
  log.info('');
  log.info('  Dica: o --list mostra so o que o cliente carregou. A busca por');
  log.info('  ID (--game / --games) funciona para partidas bem mais antigas.');
  log.info('');
  log.info('De arquivo de replay (funciona com o jogo fechado):');
  log.info('  --replays          lista os replays salvos');
  log.info('  --replay <id>      importa a partida a partir do replay');
  log.info('');
  log.info('Extras: --dry-run, --api <url>, --series <id>, --interval <seg>');
  log.info('  --refresh          reescreve a scoreboard de partidas ja importadas\n');
}

main().catch((error) => {
  log.fail(error.message);
  process.exit(1);
});
