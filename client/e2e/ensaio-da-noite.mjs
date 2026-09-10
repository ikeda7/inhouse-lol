#!/usr/bin/env node
/**
 * Ensaio da noite de jogos.
 *
 * Percorre pela API, na ordem de uma noite de verdade, tudo o que precisa
 * funcionar com dez pessoas esperando: cadastrar quem chegou em cima da hora,
 * sortear os times, montar o draft com capitães, abrir a MD3, registrar os
 * jogos com Fearless, importar do cliente do LoL e fechar a série.
 *
 * Os testes de unidade cobrem cada regra isolada; este script cobre o que só
 * aparece com as peças juntas -- rota, validação, banco e a mensagem que
 * chega na tela quando algo é recusado.
 *
 * GRAVA DADOS. Por isso recusa qualquer servidor que não seja local: rode
 * contra um banco descartável, nunca contra o dev.db nem produção.
 *
 *   cd server
 *   DATABASE_URL=file:./ensaio.db npx prisma db push --skip-generate
 *   DATABASE_URL=file:./ensaio.db npm run db:seed
 *   DATABASE_URL=file:./ensaio.db PORT=3334 npx tsx src/index.ts
 *   node client/e2e/ensaio-da-noite.mjs --base http://localhost:3334
 *
 * Pode rodar várias vezes no mesmo banco: nomes e ids levam o sufixo da rodada.
 */

const args = process.argv.slice(2);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (valor('--base') ?? 'http://localhost:3333').replace(/\/$/, '');

if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  console.error(`Recusado: ${base} não é local. O ensaio grava dados -- use um banco descartável.`);
  process.exit(2);
}

const rodada = Date.now().toString(36);
const falhas = [];
let aprovados = 0;
/** Estado que um passo deixa para os seguintes. */
const ctx = {};

/** Chave do grupo, quando o servidor exige (GROUP_KEY). O CI liga as duas pontas. */
const CHAVE = process.env.INHOUSE_CHAVE ?? null;

/**
 * Por padrão, fala como alguém do grupo (manda a chave, se houver).
 * `semChave` fala como um visitante qualquer; `cookie`, como quem está logado.
 * Devolve junto o cookie de sessão que a resposta tiver posto.
 */
async function api(metodo, caminho, corpo, opcoes = {}) {
  const resposta = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'content-type': 'application/json' } : {}),
      ...(CHAVE && !opcoes.semChave ? { 'x-chave-do-grupo': CHAVE } : {}),
      ...(opcoes.cookie ? { cookie: opcoes.cookie } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => ({}));
  const sessao = /inhouse_session=([^;]+)/.exec(resposta.headers.get('set-cookie') ?? '')?.[1];
  return {
    status: resposta.status,
    ...json,
    cookie: sessao ? `inhouse_session=${sessao}` : undefined,
  };
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function precisa(...chaves) {
  for (const chave of chaves) {
    exigir(ctx[chave] !== undefined, `depende de um passo anterior que falhou (${chave})`);
  }
}

/** A resposta tem de ser sucesso; devolve o `data`. */
function dados(resposta, contexto) {
  exigir(
    resposta.success,
    `${contexto}: HTTP ${resposta.status} ${resposta.code ?? ''} ${resposta.error ?? ''}`
  );
  return resposta.data;
}

/** A resposta tem de ser a recusa esperada, com uma mensagem que a tela possa mostrar. */
function recusa(resposta, code, contexto) {
  exigir(!resposta.success, `${contexto}: deveria recusar, mas aceitou`);
  exigir(
    resposta.code === code,
    `${contexto}: esperava ${code}, veio ${resposta.code ?? 'sem code'} (${resposta.error})`
  );
  exigir(
    typeof resposta.error === 'string' && resposta.error.length > 10,
    `${contexto}: recusa sem mensagem legível para a tela`
  );
}

/** Um passo pode devolver o motivo de ter sido pulado -- aparece, mas não conta como ok. */
async function passo(nome, fn) {
  try {
    const pulado = await fn();
    if (typeof pulado === 'string') {
      console.log(`  --      ${nome} (pulado: ${pulado})`);
      return;
    }
    aprovados++;
    console.log(`  ok      ${nome}`);
  } catch (erro) {
    falhas.push(nome);
    console.log(`  FALHOU  ${nome}\n          ${erro.message}`);
  }
}

const CAMPEOES_JOGO_1 = [
  'Garen',
  'Lee Sin',
  'Ahri',
  'Jinx',
  'Thresh',
  'Darius',
  'Vi',
  'Lux',
  'Caitlyn',
  'Leona',
];
const CAMPEOES_JOGO_2 = [
  'Malphite',
  'Amumu',
  'Annie',
  'Ashe',
  'Blitzcrank',
  'Nasus',
  'Warwick',
  'Zed',
  'Ezreal',
  'Nami',
];
/** Os mesmos 10 do jogo 1, pelo id numérico que o cliente do LoL manda. */
const IDS_JOGO_LCU = [86, 64, 103, 222, 412, 122, 254, 99, 51, 89];

const escalados = (times) => [...times.blueTeam.players, ...times.redTeam.players];

function validarTimes(times, contexto) {
  for (const time of [times.blueTeam, times.redTeam]) {
    exigir(time.players.length === 5, `${contexto}: ${time.side} com ${time.players.length}`);
    const roles = new Set(time.players.map((a) => a.role));
    exigir(roles.size === 5, `${contexto}: ${time.side} com role repetida`);
  }
  const ids = new Set(escalados(times).map((a) => a.player.id));
  exigir(ids.size === 10, `${contexto}: alguém escalado duas vezes`);
}

/** Payload do formulário manual a partir de um sorteio. */
function partida(times, campeoes, { inverterLados = false, vencedor }) {
  return {
    winner: vencedor,
    gameDurationSec: 1800,
    source: 'MANUAL',
    players: escalados(times).map((a, i) => ({
      playerId: a.player.id,
      teamSide: inverterLados ? (a.side === 'BLUE' ? 'RED' : 'BLUE') : a.side,
      rolePlayed: a.role,
      championName: campeoes[i],
      kills: 3,
      deaths: 2,
      assists: 5,
      damage: 15000,
      damageTaken: 18000,
      goldEarned: 10000,
      visionScore: 20,
      cs: 150,
    })),
  };
}

/** Custom game no formato cru do LCU, com os nicks cadastrados de cada um. */
function partidaDoCliente(times, riotIdPorJogador) {
  const lanes = {
    TOP: { lane: 'TOP', role: 'SOLO' },
    JUNGLE: { lane: 'JUNGLE', role: 'NONE' },
    MID: { lane: 'MIDDLE', role: 'SOLO' },
    ADC: { lane: 'BOTTOM', role: 'DUO_CARRY' },
    SUPPORT: { lane: 'BOTTOM', role: 'DUO_SUPPORT' },
  };
  const lista = escalados(times);
  return {
    gameId: 2_900_000_000 + Math.floor(Math.random() * 90_000_000),
    platformId: 'BR1',
    gameCreation: Date.now() - 3_600_000,
    gameDuration: 1850,
    gameType: 'CUSTOM_GAME',
    gameMode: 'CLASSIC',
    queueId: 0,
    mapId: 11,
    participants: lista.map((a, i) => ({
      participantId: i + 1,
      championId: IDS_JOGO_LCU[i],
      teamId: a.side === 'BLUE' ? 100 : 200,
      spell1Id: a.role === 'JUNGLE' ? 11 : 4,
      spell2Id: 4,
      timeline: lanes[a.role],
      stats: {
        kills: 4,
        deaths: 3,
        assists: 6,
        totalDamageDealtToChampions: 18000,
        totalDamageTaken: 20000,
        goldEarned: 11000,
        visionScore: 25,
        totalMinionsKilled: 160,
        neutralMinionsKilled: 10,
        win: a.side === 'BLUE',
        gameEndedInSurrender: false,
      },
    })),
    participantIdentities: lista.map((a, i) => {
      const [gameName, tagLine] = riotIdPorJogador.get(a.player.id).split('#');
      // PUUID fixo por jogador: numa segunda rodada no mesmo banco, o vínculo
      // da primeira continua valendo em vez de virar "desconhecido".
      return {
        participantId: i + 1,
        player: { puuid: `ensaio-${a.player.id}`, gameName, tagLine, summonerName: gameName },
      };
    }),
    teams: [
      { teamId: 100, win: 'Win' },
      { teamId: 200, win: 'Fail' },
    ],
  };
}

console.log(`Ensaio da noite contra ${base} (rodada ${rodada})\n`);

// ---------------------------------------------------------------------------
console.log('Chegada');

await passo('servidor responde', async () => {
  exigir(dados(await api('GET', '/health'), 'health').status === 'ok', 'health sem status ok');
});

await passo('lista pública de jogadores não expõe e-mail', async () => {
  const jogadores = dados(await api('GET', '/players'), 'listar');
  exigir(jogadores.length >= 9, `só ${jogadores.length} ativos; o ensaio precisa de 9 + o novato`);
  const vazando = jogadores.filter((p) => 'email' in p || 'passwordHash' in p);
  exigir(vazando.length === 0, `${vazando.length} jogador(es) com e-mail/hash na resposta pública`);
  exigir(
    jogadores.every((p) => typeof p.hasAccount === 'boolean'),
    'hasAccount ausente na lista'
  );
  ctx.jogadores = jogadores;
});

await passo('cadastra jogador novo na hora, com a primeira role como main', async () => {
  const novo = dados(
    await api('POST', '/players', {
      name: `Novato ${rodada}`,
      roles: ['SUPPORT', 'ADC'],
      riotId: `Novato${rodada}#BR1`,
    }),
    'cadastrar'
  );
  exigir(novo.roles[0] === 'SUPPORT', 'a primeira role clicada não virou a main');
  exigir(novo.hasAccount === false, 'recém-cadastrado aparece como se tivesse conta');
  ctx.novato = novo;
});

await passo('recusa nome repetido com mensagem clara', async () => {
  precisa('novato');
  recusa(
    await api('POST', '/players', { name: ctx.novato.name, roles: ['MID'] }),
    'UNIQUE_VIOLATION',
    'nome repetido'
  );
});

await passo('recusa jogador sem nenhuma role', async () => {
  recusa(
    await api('POST', '/players', { name: `Sem Role ${rodada}`, roles: [] }),
    'VALIDATION_ERROR',
    'sem role'
  );
});

// ---------------------------------------------------------------------------
console.log('\nSegurança');

const SEM_TRAVA = 'servidor sem GROUP_KEY';

await passo('a trava de escrita está no estado esperado', async () => {
  ctx.protegido = dados(await api('GET', '/health'), 'health').grupoProtegido === true;
  if (CHAVE) {
    exigir(ctx.protegido, 'o ensaio tem INHOUSE_CHAVE, mas o servidor está sem GROUP_KEY');
  } else {
    exigir(!ctx.protegido, 'o servidor exige a chave e o ensaio não tem INHOUSE_CHAVE');
  }
});

await passo('de fora do grupo: lê tudo, não grava nada', async () => {
  if (!ctx.protegido) return SEM_TRAVA;
  precisa('novato');
  const deFora = { semChave: true };
  dados(await api('GET', '/players', undefined, deFora), 'leitura pública');
  recusa(
    await api('POST', '/series', { name: `Intruso ${rodada}` }, deFora),
    'GROUP_KEY_REQUIRED',
    'abrir MD3'
  );
  recusa(
    await api('PATCH', `/players/${ctx.novato.id}`, { riotId: 'Intruso#BR1' }, deFora),
    'GROUP_KEY_REQUIRED',
    'trocar o Riot ID de alguém'
  );
  recusa(
    await api('POST', '/ingest/lcu', { game: { gameId: 1 } }, deFora),
    'GROUP_KEY_REQUIRED',
    'importar partida'
  );
});

await passo('reivindicar a conta de alguém sem a chave é recusado', async () => {
  if (!ctx.protegido) return SEM_TRAVA;
  precisa('novato');
  recusa(
    await api(
      'POST',
      '/auth/register',
      {
        playerId: ctx.novato.id,
        email: `intruso-${rodada}@ensaio.local`,
        password: 'senha-intrusa',
      },
      { semChave: true }
    ),
    'GROUP_KEY_REQUIRED',
    'cadastro sem chave'
  );
});

await passo('conta criada com a chave grava depois só com a sessão', async () => {
  const jogador = dados(
    await api('POST', '/players', { name: `Conta ${rodada}`, roles: ['MID'] }),
    'cadastrar'
  );
  const email = `conta-${rodada}@ensaio.local`;
  const criada = await api('POST', '/auth/register', {
    playerId: jogador.id,
    email,
    password: 'senha-do-ensaio-1',
  });
  const conta = dados(criada, 'criar conta');
  exigir(criada.cookie, 'criar conta não devolveu o cookie de sessão');
  exigir(conta.email === email, 'a própria conta não trouxe o próprio e-mail');
  // Nenhuma chave: a sessão sozinha tem de bastar para gravar.
  dados(
    await api(
      'PATCH',
      `/players/${jogador.id}`,
      { internalRating: 1100 },
      { semChave: true, cookie: criada.cookie }
    ),
    'gravar só com a sessão'
  );
  ctx.conta = { id: jogador.id, cookie: criada.cookie };
});

await passo('trocar a senha derruba as outras sessões e mantém a de quem trocou', async () => {
  precisa('conta');
  const comoConta = (cookie) => ({ semChave: true, cookie });
  const troca = await api(
    'POST',
    '/accounts/me/password',
    { currentPassword: 'senha-do-ensaio-1', newPassword: 'senha-do-ensaio-2' },
    comoConta(ctx.conta.cookie)
  );
  dados(troca, 'trocar a senha');
  exigir(troca.cookie, 'a troca de senha não renovou a sessão de quem trocou');
  recusa(
    await api('GET', '/auth/me', undefined, comoConta(ctx.conta.cookie)),
    'NOT_AUTHENTICATED',
    'sessão de antes da troca'
  );
  const eu = dados(await api('GET', '/auth/me', undefined, comoConta(troca.cookie)), 'sessão nova');
  exigir(eu.id === ctx.conta.id, 'a sessão nova não é da mesma conta');
});

// ---------------------------------------------------------------------------
console.log('\nSorteio');

await passo('sorteia 10 com o novato dentro, 20 vezes seguidas', async () => {
  precisa('jogadores', 'novato');
  // 9 veteranos + o novato: o caso real de quem chega em cima da hora.
  ctx.elenco = [...ctx.jogadores.slice(0, 9).map((p) => p.id), ctx.novato.id];
  for (let seed = 1; seed <= 20; seed++) {
    const times = dados(
      await api('POST', '/draft/auto-balance', { playerIds: ctx.elenco, seed }),
      `sorteio ${seed}`
    );
    validarTimes(times, `sorteio ${seed}`);
    if (seed === 1) ctx.times = times;
  }
});

await passo('a mesma seed repete o mesmo sorteio', async () => {
  precisa('elenco', 'times');
  const deNovo = dados(
    await api('POST', '/draft/auto-balance', { playerIds: ctx.elenco, seed: 1 }),
    'repetir'
  );
  const azul = (t) =>
    t.blueTeam.players
      .map((a) => a.player.id)
      .sort()
      .join();
  exigir(azul(deNovo) === azul(ctx.times), 'mesma seed deu times diferentes');
});

await passo('com 9 jogadores recusa em vez de sortear torto', async () => {
  precisa('elenco');
  recusa(
    await api('POST', '/draft/auto-balance', { playerIds: ctx.elenco.slice(0, 9) }),
    'VALIDATION_ERROR',
    '9 jogadores'
  );
});

await passo('jogador inexistente no elenco é recusado pelo nome do problema', async () => {
  precisa('elenco');
  recusa(
    await api('POST', '/draft/auto-balance', {
      playerIds: [...ctx.elenco.slice(0, 9), 'id-que-nao-existe'],
    }),
    'PLAYER_NOT_FOUND',
    'id inexistente'
  );
});

await passo('modo capitães: 8 escolhas fecham os dois times', async () => {
  precisa('elenco');
  let estado = dados(
    await api('POST', '/draft/captains/start', { playerIds: ctx.elenco, mode: 'RANDOM', seed: 7 }),
    'começar'
  );
  exigir(estado.available.length === 8, `pote com ${estado.available.length}, esperava 8`);
  for (let i = 1; i <= 8; i++) {
    const { captains, available, picks, onTheClock, pickNumber, finished } = estado;
    estado = dados(
      await api('POST', '/draft/captains/pick', {
        state: { captains, available, picks, onTheClock, pickNumber, finished },
        playerId: available[0].id,
      }),
      `escolha ${i}`
    );
  }
  exigir(estado.finished && estado.teams, 'draft não fechou depois de 8 escolhas');
  validarTimes(estado.teams, 'capitães');
});

await passo('sala ao vivo: o capitão pega o lado e ninguém rouba', async () => {
  precisa('elenco');
  const sala = dados(
    await api('POST', '/draft/rooms', { playerIds: ctx.elenco, mode: 'RANDOM', seed: 3 }),
    'abrir sala'
  );
  const pego = dados(
    await api('POST', `/draft/rooms/${sala.code}/claim`, { side: 'BLUE' }),
    'pegar o azul'
  );
  exigir(typeof pego.token === 'string', 'pegar o lado não devolveu o segredo');
  recusa(
    await api('POST', `/draft/rooms/${sala.code}/claim`, { side: 'BLUE' }),
    'SIDE_ALREADY_CLAIMED',
    'segundo capitão no azul'
  );
  ctx.sala = sala.code;
  ctx.tokenAzul = pego.token;
});

await passo('sala ao vivo: respeita a vez, a versão e fecha os times', async () => {
  precisa('sala', 'tokenAzul');
  let sala = dados(await api('GET', `/draft/rooms/${ctx.sala}`), 'ler sala');
  let testouVez = false;
  let testouVersao = false;

  while (!sala.state.finished) {
    const lado = sala.state.onTheClock;
    const escolhido = sala.state.available[0].id;
    const token = lado === 'BLUE' ? ctx.tokenAzul : undefined;
    const rota = `/draft/rooms/${ctx.sala}/pick`;

    if (lado === 'BLUE' && !testouVez) {
      // O lado tem dono: sem o segredo dele, a escolha não entra.
      recusa(
        await api('POST', rota, { playerId: escolhido, version: sala.version }),
        'NOT_YOUR_TURN',
        'escolha sem o segredo'
      );
      testouVez = true;
    }
    if (sala.version >= 1 && !testouVersao) {
      // Dois clicando junto: quem chega com a versão velha é recusado.
      recusa(
        await api('POST', rota, { playerId: escolhido, version: sala.version - 1, token }),
        'ROOM_VERSION_CONFLICT',
        'versão velha'
      );
      testouVersao = true;
    }
    sala = dados(
      await api('POST', rota, { playerId: escolhido, version: sala.version, token }),
      `escolha do ${lado}`
    );
  }

  exigir(testouVez && testouVersao, 'o roteiro não chegou a exercitar as travas');
  exigir(sala.teams, 'a sala fechou sem montar os times');
  validarTimes(sala.teams, 'sala ao vivo');
  const nada = dados(
    await api('GET', `/draft/rooms/${ctx.sala}?since=${sala.version}`),
    'consulta barata'
  );
  exigir(nada.unchanged === true, 'consulta com a versão atual não respondeu "unchanged"');
});

// ---------------------------------------------------------------------------
console.log('\nMD3');

await passo('abre a MD3 com Fearless e ela vira a "em andamento"', async () => {
  const serie = dados(
    await api('POST', '/series', { name: `Ensaio ${rodada}`, fearless: true }),
    'abrir'
  );
  exigir(serie.status === 'ONGOING' && serie.fearless, 'não abriu em andamento com Fearless');
  const atual = dados(await api('GET', '/series/current'), 'em andamento');
  exigir(atual?.id === serie.id, 'a MD3 recém-aberta não é a "em andamento"');
  ctx.serie = serie.id;
});

await passo('registra o jogo 1 e queima os 10 campeões', async () => {
  precisa('serie', 'times');
  dados(
    await api(
      'POST',
      `/series/${ctx.serie}/matches`,
      partida(ctx.times, CAMPEOES_JOGO_1, { vencedor: 'BLUE' })
    ),
    'jogo 1'
  );
  const queimados = dados(await api('GET', `/series/${ctx.serie}/burned`), 'queimados');
  exigir(queimados.length === 10, `${queimados.length} queimados, esperava 10`);
});

await passo('Fearless barra campeão repetido no jogo 2', async () => {
  precisa('serie', 'times');
  const comRepetido = [...CAMPEOES_JOGO_2.slice(0, 9), 'Garen'];
  recusa(
    await api(
      'POST',
      `/series/${ctx.serie}/matches`,
      partida(ctx.times, comRepetido, { inverterLados: true, vencedor: 'RED' })
    ),
    'FEARLESS_VIOLATION',
    'Garen de novo'
  );
});

await passo('jogo 2 com lados trocados: o placar segue o elenco, não a cor', async () => {
  precisa('serie', 'times');
  // O time A (azul no jogo 1) joga de vermelho e vence de novo: é 2-0, não 1-1.
  dados(
    await api(
      'POST',
      `/series/${ctx.serie}/matches`,
      partida(ctx.times, CAMPEOES_JOGO_2, { inverterLados: true, vencedor: 'RED' })
    ),
    'jogo 2'
  );
  const serie = dados(await api('GET', `/series/${ctx.serie}`), 'ler a MD3');
  exigir(
    serie.blueScore === 2 && serie.redScore === 0,
    `placar ${serie.blueScore}-${serie.redScore}, esperava 2-0`
  );
  exigir(serie.status === 'FINISHED', `MD3 decidida continuou ${serie.status}`);
});

await passo('MD3 decidida recusa um jogo 3', async () => {
  precisa('serie', 'times');
  recusa(
    await api(
      'POST',
      `/series/${ctx.serie}/matches`,
      partida(ctx.times, CAMPEOES_JOGO_2, { vencedor: 'BLUE' })
    ),
    'SERIES_FINISHED',
    'jogo 3'
  );
});

await passo('ranking e destaques contam a noite', async () => {
  precisa('novato', 'serie');
  const ranking = dados(await api('GET', '/stats/leaderboard'), 'ranking');
  const novato = ranking.find((linha) => linha.playerId === ctx.novato.id);
  exigir(novato?.games >= 2, 'o novato não aparece no ranking com os 2 jogos');
  dados(await api('GET', '/stats/highlights'), 'destaques');
});

await passo('MD3 aberta sem querer é descartável; com jogo, não', async () => {
  precisa('serie');
  const vazia = dados(await api('POST', '/series', { name: `Sem querer ${rodada}` }), 'abrir');
  dados(await api('DELETE', `/series/${vazia.id}`), 'descartar a vazia');
  recusa(await api('DELETE', `/series/${ctx.serie}`), 'SERIES_NOT_EMPTY', 'descartar a jogada');
});

// ---------------------------------------------------------------------------
console.log('\nImportação pelo cliente do LoL (o que o companion manda)');

await passo('importa o custom game na MD3, ligando cada nick ao cadastro', async () => {
  precisa('times');
  // Quem ainda não tem Riot ID ganha um; é o que o servidor usa para ligar o
  // participante da partida ao cadastro (autoLink) -- numa noite real, o
  // passo que falha se o Riot ID estiver escrito errado.
  for (const a of escalados(ctx.times)) {
    if (a.player.riotId) continue;
    dados(
      await api('PATCH', `/players/${a.player.id}`, { riotId: `E${a.player.id.slice(-8)}#BR1` }),
      'dar Riot ID'
    );
  }
  const jogadores = dados(await api('GET', '/players'), 'listar');
  const riotIds = new Map(jogadores.map((p) => [p.id, p.riotId]));

  const serie = dados(
    await api('POST', '/series', { name: `Ensaio LCU ${rodada}`, fearless: true }),
    'abrir'
  );
  const jogo = partidaDoCliente(ctx.times, riotIds);

  const previa = dados(
    await api('POST', '/ingest/lcu', { game: jogo, seriesId: serie.id, dryRun: true }),
    'prévia'
  );
  exigir(previa.saved === false, 'a prévia gravou');
  const salvo = dados(
    await api('POST', '/ingest/lcu', { game: jogo, seriesId: serie.id }),
    'gravar'
  );
  exigir(salvo.saved === true, 'a importação não gravou');

  const detalhe = dados(await api('GET', `/series/${serie.id}`), 'ler');
  exigir(detalhe.matches.length === 1, `${detalhe.matches.length} partidas, esperava 1`);
  exigir(detalhe.matches[0].source === 'LCU', `origem ${detalhe.matches[0].source}, esperava LCU`);
  ctx.jogoLcu = jogo;
  ctx.serieLcu = serie.id;
});

await passo('reenviar a mesma partida não duplica; refreshStats atualiza no lugar', async () => {
  precisa('jogoLcu', 'serieLcu');
  const corpo = { game: ctx.jogoLcu, seriesId: ctx.serieLcu };
  const deNovo = dados(await api('POST', '/ingest/lcu', corpo), 'reenviar');
  exigir(deNovo.alreadyImported === true, 'o reenvio não foi reconhecido como já importado');
  const refeito = dados(
    await api('POST', '/ingest/lcu', { ...corpo, refreshStats: true }),
    'refreshStats'
  );
  exigir(refeito.refreshed === true, 'refreshStats não atualizou');
  const detalhe = dados(await api('GET', `/series/${ctx.serieLcu}`), 'ler');
  exigir(detalhe.matches.length === 1, `${detalhe.matches.length} partidas depois do reenvio`);
});

await passo('participante desconhecido: recusa dizendo quem falta', async () => {
  precisa('jogoLcu', 'serieLcu');
  const comEstranho = structuredClone(ctx.jogoLcu);
  comEstranho.gameId += 1;
  comEstranho.participantIdentities[0].player = {
    puuid: `estranho-${rodada}`,
    gameName: 'Estranho',
    tagLine: 'XX1',
    summonerName: 'Estranho',
  };
  const resposta = await api('POST', '/ingest/lcu', { game: comEstranho, seriesId: ctx.serieLcu });
  recusa(resposta, 'UNMATCHED_PARTICIPANTS', 'desconhecido');
  exigir(resposta.details?.unmatched?.length === 1, 'a recusa não diz quem falta vincular');
});

await passo('sem MD3 em andamento, a importação avisa em vez de sumir', async () => {
  precisa('jogoLcu');
  // Fecha tudo o que estiver aberto -- inclusive sobras de rodadas anteriores.
  for (const serie of dados(await api('GET', '/series?limit=100'), 'listar')) {
    if (serie.status === 'ONGOING')
      dados(await api('POST', `/series/${serie.id}/finish`), 'fechar');
  }
  const outra = structuredClone(ctx.jogoLcu);
  outra.gameId += 2;
  recusa(await api('POST', '/ingest/lcu', { game: outra }), 'NO_ONGOING_SERIES', 'sem MD3');
});

// ---------------------------------------------------------------------------
console.log(
  `\n${aprovados} ok, ${falhas.length} falha(s)${falhas.length ? `:\n - ${falhas.join('\n - ')}` : ''}`
);
process.exit(falhas.length ? 1 : 0);
