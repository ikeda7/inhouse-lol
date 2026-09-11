#!/usr/bin/env node
/**
 * Fluxos no navegador: clica nas coisas e confere que elas FAZEM o que dizem.
 *
 * A verificação de telas mede a tela parada -- contraste, rolagem, conteúdo
 * cortado. Ela não pega um seletor que desenha certo e não filtra nada, e foi
 * exatamente isso que passou duas vezes nos Momentos: primeiro as abas não
 * mudavam a lista, depois só a noite mais recente tinha abas. Este script
 * existe para esse tipo de defeito.
 *
 *   1. Destaques: o seletor chega em TODAS as noites, e cada noite e cada jogo
 *      filtram a tela de verdade; a imagem daquele recorte baixa.
 *   2. Histórico: abre série, jogo e jogador; as imagens da série e do jogo baixam.
 *   3. Ranking: a imagem baixa, e cada ordenação deixa a tabela na ordem que a
 *      API dá para ela.
 *   4. Jogadores: cada filtro mostra exatamente quantos a API diz que faltam.
 *   5. Sorteio: "tenta outro" traz outro sorteio; no modo capitães, os dois
 *      escolhidos na mão ficam com azul e vermelho e o draft fecha 5x5. Nada
 *      disso grava -- sorteio e draft são calculadoras (lib/escritas.ts).
 *   6. Ajuda: o "?" do cabeçalho leva para "Como funciona".
 *   7. Sorteio → Série (só com --preparar): marcar 10, sortear, "Usar esses
 *      times na série" abre a MD3 e leva para a Série.
 *   8. Série (só com --preparar): registra o jogo 1 pelo formulário, linha a
 *      linha -- os menus da última linha abrem inteiros, sem rolar a tabela --,
 *      confere placar e API, o Fearless recusa no jogo 2 um campeão do jogo 1,
 *      e "Encerrar" fecha a MD3.
 *   9. Sala ao vivo (só com --preparar): dois capitães em navegadores
 *      diferentes pegam um lado cada; quem não está na vez não clica no pote;
 *      cada escolha aparece na tela do outro pela consulta; as duas fecham 5x5.
 *  10. Jogadores (só com --preparar): cadastrar com roles na ordem do clique,
 *      editar Riot ID e roles, desativar -- e conferir cada passo na API e no
 *      Sorteio.
 *
 * Uso (servidor servindo API e front no mesmo endereço):
 *
 *   node client/e2e/fluxos.mjs --base http://localhost:3333 --preparar
 *
 *   --preparar   GRAVA: garante duas noites com momentos (o seletor de noite
 *                precisa de mais de uma) e abre duas MD3, pelo Sorteio e pela
 *                Série, fechando as duas. Recusa servidor que não seja local.
 *   --saida DIR  onde guardar as imagens baixadas (padrão: e2e-saida)
 *
 * Sai com 1 se algum fluxo falhar, 2 se não conseguir nem começar.
 */

import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const BASE = opcao('--base', 'http://localhost:3333').replace(/\/$/, '');
const SAIDA = opcao('--saida', 'e2e-saida');
const PREPARAR = args.includes('--preparar');
const CHAVE = process.env.INHOUSE_CHAVE ?? null;

if (PREPARAR && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) {
  console.error(`Recusado: --preparar grava dados, e ${BASE} não é local.`);
  process.exit(2);
}

/** Sobras de ensaio e da verificação de telas: nunca entram num elenco de teste. */
const SOBRA = /^(Conta|Novato|Reserva|Fluxo) /;

async function api(metodo, rota, corpo) {
  const resposta = await fetch(`${BASE}/api${rota}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'content-type': 'application/json' } : {}),
      ...(CHAVE ? { 'x-chave-do-grupo': CHAVE } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok || json.success === false) {
    throw new Error(`${metodo} ${rota} -> ${resposta.status} ${json.error ?? ''}`.trim());
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Cenário (--preparar)
// ---------------------------------------------------------------------------

async function fecharMd3Aberta() {
  const atual = await api('GET', '/series/current');
  if (atual) await api('POST', `/series/${atual.id}/finish`);
}

/**
 * Uma noite a mais com momentos, se só houver uma: com uma noite só, "o
 * seletor chega em todas as noites" passaria sem testar nada.
 */
async function garantirDuasNoites() {
  const { momentos } = await api('GET', '/stats/highlights');
  if (new Set(momentos.map((m) => m.seriesId)).size >= 2) return;

  await fecharMd3Aberta();
  const veteranos = (await api('GET', '/players')).filter((p) => !SOBRA.test(p.name));
  if (veteranos.length < 10) throw new Error(`preciso de 10 veteranos, há ${veteranos.length}`);

  const { serie } = await api('POST', '/series/garantir', {
    name: `Noite dos fluxos ${Date.now().toString(36)}`,
    fearless: true,
  });
  const roles = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
  const campeoes = [
    'Malphite',
    'Nocturne',
    'Orianna',
    'Vayne',
    'Soraka',
    'Renekton',
    'Hecarim',
    'Viktor',
    'Tristana',
    'Taric',
  ];
  // Números bem diferentes entre si: momento (carregou, muralha, visão) só
  // existe quando alguém se destaca dos outros nove.
  await api('POST', `/series/${serie.id}/matches`, {
    winner: 'RED',
    gameDurationSec: 1900,
    players: veteranos.slice(0, 10).map((p, i) => ({
      playerId: p.id,
      teamSide: i < 5 ? 'BLUE' : 'RED',
      rolePlayed: roles[i % 5],
      championName: campeoes[i],
      kills: [2, 6, 9, 4, 1, 12, 5, 7, 3, 0][i],
      deaths: [7, 5, 4, 6, 8, 1, 3, 2, 4, 3][i],
      assists: [3, 8, 5, 6, 14, 7, 9, 6, 8, 19][i],
      damage: [12000, 17000, 29000, 21000, 6000, 41000, 18000, 23000, 15000, 5000][i],
      damageTaken: [36000, 22000, 14000, 13000, 11000, 19000, 30000, 12000, 10000, 16000][i],
      goldEarned: [9000, 11000, 13000, 12500, 7000, 16000, 12000, 13500, 11500, 7500][i],
      visionScore: [18, 30, 22, 15, 70, 20, 28, 19, 16, 92][i],
      cs: [190, 150, 230, 250, 30, 240, 170, 220, 260, 25][i],
    })),
  });
  await api('POST', `/series/${serie.id}/finish`);
  console.log(`  noite "${serie.name}" com uma partida, para o seletor ter duas noites`);
}

// ---------------------------------------------------------------------------
// Fluxos
// ---------------------------------------------------------------------------

let falhas = 0;
async function fluxo(nome, fn) {
  try {
    const pulado = await fn();
    if (typeof pulado === 'string') console.log(`  --      ${nome} (pulado: ${pulado})`);
    else console.log(`  ok      ${nome}`);
  } catch (erro) {
    falhas++;
    console.log(`  FALHOU  ${nome}\n          ${String(erro.message).split('\n')[0]}`);
  }
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

/**
 * Espera a tela chegar num estado. A lista recarrega depois do clique, e ler
 * na hora pegaria a tela de antes. `condicao` devolve true ou o que viu.
 */
async function esperarAte(condicao, mensagem, ms = 15000) {
  const limite = Date.now() + ms;
  let visto = '';
  while (Date.now() < limite) {
    const resultado = await condicao();
    if (resultado === true) return;
    visto = resultado;
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  throw new Error(visto ? `${mensagem} (viu: ${visto})` : mensagem);
}

/** Nome de jogador dentro de uma RegExp, sem que um "." ou "(" vire operador. */
const literal = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Clica e espera o download; confere que saiu uma imagem de verdade (não um arquivo vazio). */
async function baixar(pagina, botao, nome) {
  const [download] = await Promise.all([
    pagina.waitForEvent('download', { timeout: 30000 }),
    botao.click(),
  ]);
  const destino = join(SAIDA, `fluxo-${nome}`);
  await download.saveAs(destino);
  const tamanho = statSync(destino).size;
  exigir(tamanho > 5000, `${nome}: a imagem saiu com ${tamanho} bytes`);
}

/** O que a API diz que existe: noites com momentos e os jogos de cada uma. */
async function noitesDaApi() {
  const { momentos } = await api('GET', '/stats/highlights');
  const noites = new Map();
  for (const m of momentos) {
    const noite = noites.get(m.seriesId) ?? {
      nome: m.seriesName ?? new Date(m.playedAt).toLocaleDateString('pt-BR'),
      jogos: new Set(),
    };
    noite.jogos.add(m.matchNumber);
    noites.set(m.seriesId, noite);
  }
  return [...noites.values()].map((n) => ({ ...n, jogos: [...n.jogos].sort((a, b) => a - b) }));
}

async function fluxoDosMomentos(pagina) {
  const noites = await noitesDaApi();
  if (noites.length === 0) return 'nenhum momento registrado';

  await pagina.goto(`${BASE}/destaques`, { waitUntil: 'networkidle' });
  const card = pagina.locator('section', {
    has: pagina.getByRole('group', { name: 'Noite dos momentos' }),
  });
  await card.waitFor({ timeout: 20000 });

  const titulos = async () =>
    (await card.locator('h3').allInnerTexts()).map((t) => t.split('\n')[0].trim());
  const jogosDosCartoes = async () =>
    (await card.locator('a[href^="/jogadores/"]').allInnerTexts())
      .map((t) => /Jogo (\d+)/.exec(t)?.[1])
      .filter(Boolean)
      .map(Number);

  // "Todas": a tela mostra todas as noites que a API tem.
  exigir(
    (await titulos()).length === noites.length,
    `"Todas" mostrou ${(await titulos()).length} noites, a API tem ${noites.length}`
  );

  await card.getByRole('button', { name: 'Por noite', exact: true }).click();
  const seletorDeNoite = card.getByRole('group', { name: 'Escolher a noite' });
  for (const [indice, noite] of noites.entries()) {
    const nomeNaTela = (await seletorDeNoite.locator('span').innerText()).trim();
    exigir(nomeNaTela === noite.nome, `noite ${indice + 1}: seletor mostra "${nomeNaTela}"`);
    exigir(
      JSON.stringify(await titulos()) === JSON.stringify([noite.nome]),
      `noite "${noite.nome}": a tela mostra ${JSON.stringify(await titulos())}`
    );

    const jogos = card.getByRole('group', { name: 'Quais momentos mostrar' });
    for (const jogo of noite.jogos) {
      await jogos.getByRole('button', { name: `Jogo ${jogo}`, exact: true }).click();
      const vistos = await jogosDosCartoes();
      exigir(vistos.length > 0, `"${noite.nome}" jogo ${jogo}: nenhum cartão`);
      exigir(
        vistos.every((n) => n === jogo),
        `"${noite.nome}" jogo ${jogo}: a tela mostra cartões dos jogos ${[...new Set(vistos)]}`
      );
      exigir(
        (await card.getByText(/^Imagem:/).innerText()).includes(`Jogo ${jogo}`),
        `"${noite.nome}" jogo ${jogo}: a legenda da imagem não acompanhou`
      );
    }
    await jogos.getByRole('button', { name: 'Noite toda', exact: true }).click();

    if (indice === 0) {
      await baixar(pagina, card.getByRole('button', { name: 'Baixar' }), 'momentos.png');
    }
    if (indice < noites.length - 1) {
      await seletorDeNoite.getByRole('button', { name: 'Noite anterior' }).click();
    }
  }
}

async function fluxoDoHistorico(pagina) {
  // A primeira série COM jogo: uma MD3 aberta e ainda vazia não tem imagem
  // para baixar, e ela é justamente a primeira da lista numa noite em curso.
  const comJogo = (await api('GET', '/series?limit=30')).find((s) => s.matches.length > 0);
  if (!comJogo) return 'nenhuma série com jogo';
  const rotulo = comJogo.name ?? new Date(comJogo.date).toLocaleDateString('pt-BR');

  await pagina.goto(`${BASE}/historico`, { waitUntil: 'networkidle' });
  await pagina.locator('li > div > button[aria-expanded]', { hasText: rotulo }).first().click();
  await pagina.getByText('Imagem da série').waitFor({ timeout: 20000 });

  const baixares = pagina.getByRole('button', { name: 'Baixar' });
  await baixar(pagina, baixares.nth(0), 'serie.png');
  await baixar(pagina, baixares.nth(1), 'jogo.png');

  // O nível do jogador: abre e mostra o detalhe. O seletor NÃO filtra por
  // aria-expanded="false": depois do clique ele passaria a apontar para o
  // próximo jogador (ainda fechado), e o teste leria o estado da linha errada.
  const jogador = pagina
    .locator('li:has(> div > button[aria-expanded="true"]) li > button[aria-expanded]')
    .first();
  await jogador.click();
  exigir(
    (await jogador.getAttribute('aria-expanded')) === 'true',
    'clicar no jogador não abriu o detalhe'
  );
}

async function fluxoDoRanking(pagina) {
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const botao = pagina.getByRole('button', { name: 'Baixar' }).first();
  if ((await botao.count()) === 0) return 'ranking vazio';
  await baixar(pagina, botao, 'ranking.png');
}

async function fluxoDaAjuda(pagina) {
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await pagina.getByRole('link', { name: 'Ajuda: como funciona' }).click();
  await pagina.waitForURL(/\/ajuda$/, { timeout: 10000 });
  await pagina.getByRole('heading', { name: 'Como funciona' }).waitFor({ timeout: 10000 });
}

const ORDENACOES = [
  ['wins', 'Vitórias'],
  ['winRate', 'Winrate'],
  ['avgKda', 'KDA'],
  ['points', 'Pontos'],
];

async function fluxoDaOrdenacao(pagina) {
  const ordens = [];
  for (const [chave] of ORDENACOES) {
    const ranking = await api('GET', `/stats/leaderboard?sortBy=${chave}&minGames=0`);
    ordens.push(ranking.map((entrada) => entrada.name));
  }
  if (ordens[0].length < 3) return 'menos de três no ranking';

  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const grupo = pagina.getByRole('group', { name: 'Ordenar por' });
  const nomesNaTabela = pagina.locator('table tbody tr td:nth-child(2) a');
  for (const [indice, [chave, rotulo]] of ORDENACOES.entries()) {
    const botao = grupo.getByRole('button', { name: rotulo, exact: true });
    // A ordem da tela sozinha não prova nada quando o dado dá a mesma ordem
    // nas quatro abas (o banco do CI dá). O pedido com o sortBy daquela aba
    // prova que ela não é enfeite, com qualquer dado.
    const jaMarcada = (await botao.getAttribute('aria-pressed')) === 'true';
    const pedido = jaMarcada
      ? null
      : pagina.waitForRequest((req) => req.url().includes(`sortBy=${chave}`), { timeout: 15000 });
    await botao.click();
    if (pedido) await pedido;
    exigir((await botao.getAttribute('aria-pressed')) === 'true', `"${rotulo}" não ficou marcado`);
    const esperado = ordens[indice].join(' > ');
    await esperarAte(async () => {
      const visto = (await nomesNaTabela.allInnerTexts()).map((t) => t.trim()).join(' > ');
      return visto === esperado || visto.slice(0, 60);
    }, `ordenado por ${rotulo}, a tabela não ficou na ordem da API`);
  }
}

async function fluxoDosFiltros(pagina) {
  const jogadores = await api('GET', '/players?includeInactive=true');
  const filtros = [
    ['Todos', jogadores.length],
    ['Sem conta', jogadores.filter((p) => p.active && !p.hasAccount).length],
    ['Sem Riot ID', jogadores.filter((p) => p.active && !p.riotId).length],
  ];
  exigir(
    filtros.some(([, quantos]) => quantos !== jogadores.length),
    'todo filtro daria a lista inteira: não dá para ver o filtro agir'
  );

  await pagina.goto(`${BASE}/jogadores`, { waitUntil: 'networkidle' });
  const grupo = pagina.getByRole('group', { name: 'Filtrar jogadores' });
  await grupo.waitFor({ timeout: 20000 });
  const linhas = pagina
    .locator('section', { has: grupo })
    .locator('ul')
    .first()
    .locator(':scope > li');

  // Termina voltando para "Todos": desmarcar também tem que funcionar.
  for (const [rotulo, esperado] of [...filtros, filtros[0]]) {
    const botao = grupo.getByRole('button', { name: new RegExp(`^${rotulo} \\d+$`, 'i') });
    await botao.click();
    exigir((await botao.getAttribute('aria-pressed')) === 'true', `"${rotulo}" não ficou marcado`);
    const noBotao = Number(/(\d+)$/.exec((await botao.innerText()).trim())?.[1]);
    exigir(noBotao === esperado, `"${rotulo}" diz ${noBotao}, a API tem ${esperado}`);
    await esperarAte(async () => {
      const quantas = await linhas.count();
      return quantas === esperado || `${quantas} linhas`;
    }, `"${rotulo}": a lista não ficou com ${esperado}`);
  }
}

/**
 * Marca os dez primeiros veteranos; devolve os nomes, na ordem. O nome sai do
 * `span.truncate` da linha: a primeira linha do texto pode ser a inicial do
 * avatar, e aí o filtro de sobras não reconheceria ninguém.
 */
async function marcarVeteranos(pagina) {
  const linhas = pagina.locator('li > label');
  await linhas.first().waitFor({ timeout: 20000 });
  const nomes = [];
  for (let i = 0; i < (await linhas.count()) && nomes.length < 10; i++) {
    const nome = (await linhas.nth(i).locator('span.truncate').first().innerText()).trim();
    if (SOBRA.test(nome)) continue;
    await linhas.nth(i).click();
    nomes.push(nome);
  }
  exigir(nomes.length === 10, `só achei ${nomes.length} veteranos para marcar`);
  return nomes;
}

async function fluxoDoSorteioDeNovo(pagina) {
  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  await marcarVeteranos(pagina);
  // O aviso de cobertura é a tela dizendo que o sorteio vai recusar -- e com
  // razão. Não é o defeito que este fluxo procura.
  if ((await pagina.getByText(/O sorteio vai recusar/).count()) > 0) {
    return 'os dez primeiros não cobrem todas as roles';
  }

  await pagina.getByRole('button', { name: /Sortear times/ }).click();
  const legenda = pagina.getByText(/seed \d+/);
  await legenda.waitFor({ timeout: 20000 });
  const seed = async () => /seed (\d+)/.exec(await legenda.innerText())?.[1];
  const primeira = await seed();
  await pagina.getByRole('button', { name: /tenta outro/ }).click();
  await esperarAte(async () => {
    const agora = await seed();
    return agora !== primeira || `seed ${agora}`;
  }, '"Não gostei, tenta outro" não trouxe outro sorteio');
}

async function fluxoDosCapitaes(pagina) {
  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  const nomes = await marcarVeteranos(pagina);

  await pagina
    .getByRole('group', { name: 'Modo' })
    .getByRole('button', { name: /Modo capitães/ })
    .click();
  await pagina.getByRole('button', { name: 'Escolher', exact: true }).click();

  // O primeiro clicado tira o azul, o segundo o vermelho.
  for (const [nome, lado] of [
    [nomes[0], 'azul'],
    [nomes[1], 'vermelho'],
  ]) {
    await pagina.getByRole('button', { name: nome, exact: true }).click();
    const marcado = pagina.getByRole('button', {
      name: new RegExp(`^${literal(nome)}\\s*· ${lado}$`),
    });
    exigir((await marcado.count()) === 1, `${nome} não virou capitão do ${lado}`);
    exigir(
      (await marcado.getAttribute('aria-pressed')) === 'true',
      `${nome} (${lado}) sem aria-pressed`
    );
  }

  await pagina.getByRole('button', { name: /Começar o draft/ }).click();
  // O pote: um botão por jogador, com o nome num <p> próprio.
  for (const nome of nomes.slice(2)) {
    const botao = pagina.locator('button', {
      has: pagina.locator('p', { hasText: new RegExp(`^${literal(nome)}$`) }),
    });
    await botao.waitFor({ timeout: 20000 });
    await esperarAte(
      async () => (await botao.isEnabled()) || 'desabilitado',
      `${nome} não liberou no pote`
    );
    await botao.click();
    await botao.waitFor({ state: 'detached', timeout: 20000 });
  }

  await pagina.getByText('Draft fechado').waitFor({ timeout: 20000 });
  const cheios = await pagina.getByText('5/5', { exact: true }).count();
  exigir(cheios === 2, `draft fechado com ${cheios} de 2 times em 5/5`);
  await pagina
    .getByRole('button', { name: /Usar esses times na série/ })
    .waitFor({ timeout: 20000 });
}

/**
 * A sala ao vivo com os dois capitães em navegadores diferentes -- como na
 * noite, cada um no seu celular. Cada um pega um lado e o outro vê o lado
 * ocupado; quem não está na vez não consegue clicar no pote; cada escolha
 * aparece na tela do outro pela consulta de 2s; e as duas telas fecham 5x5.
 */
async function fluxoDaSalaAoVivo(pagina) {
  if (!PREPARAR) return 'grava dados (a sala é uma linha no banco); rode com --preparar';

  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  const nomes = await marcarVeteranos(pagina);
  await pagina
    .getByRole('group', { name: 'Modo' })
    .getByRole('button', { name: /Modo capitães/ })
    .click();
  await pagina.getByRole('button', { name: 'Escolher', exact: true }).click();
  await pagina.getByRole('button', { name: nomes[0], exact: true }).click();
  await pagina.getByRole('button', { name: nomes[1], exact: true }).click();
  await pagina.getByRole('button', { name: /Draft ao vivo/ }).click();
  await pagina.waitForURL(/\/draft\/[A-Za-z0-9]+$/, { timeout: 20000 });
  const codigo = pagina.url().split('/').pop();

  // O outro capitão: outro navegador, no celular, sem o segredo deste.
  const outroNavegador = await pagina
    .context()
    .browser()
    .newContext({ viewport: { width: 390, height: 900 } });
  try {
    const outra = await outroNavegador.newPage();
    const errosDoOutro = [];
    outra.on('pageerror', (erro) => errosDoOutro.push(erro.message));
    await outra.goto(pagina.url(), { waitUntil: 'networkidle' });

    // O azul vem primeiro na tela. Cada um pega um lado e espera o outro ver.
    await pagina.getByRole('button', { name: 'Sou o capitão' }).first().click();
    await pagina.getByText('Você é o capitão').waitFor({ timeout: 15000 });
    await outra.getByText('Capitão definido').waitFor({ timeout: 15000 });
    await outra.getByRole('button', { name: 'Sou o capitão' }).click();
    await outra.getByText('Você é o capitão').waitFor({ timeout: 15000 });
    await pagina.getByText('Capitão definido').waitFor({ timeout: 15000 });

    const capitao = { BLUE: pagina, RED: outra };
    const pote = (tela) =>
      tela
        .locator('div.rounded-lg', { hasText: /^No pote/ })
        .last()
        .getByRole('button');

    // 1-2-2-2-1: oito escolhas depois dos capitães.
    for (let escolha = 1; escolha <= 8; escolha++) {
      const { state } = await api('GET', `/draft/rooms/${codigo}`);
      const daVez = capitao[state.onTheClock];
      const esperando = daVez === pagina ? outra : pagina;

      await esperarAte(
        async () => (await pote(daVez).first().isEnabled()) || 'pote travado',
        `escolha ${escolha}: o capitão da vez não consegue escolher`
      );
      await esperarAte(
        async () => (await pote(esperando).first().isDisabled()) || 'pote livre',
        `escolha ${escolha}: quem não está na vez consegue clicar no pote`
      );

      const nome = (await pote(daVez).first().locator('p').first().innerText()).trim();
      await pote(daVez).first().click();
      await esperarAte(async () => {
        const restantes = (await pote(esperando).locator('p').allInnerTexts()).map((t) => t.trim());
        return !restantes.includes(nome) || `${nome} ainda no pote`;
      }, `escolha ${escolha}: ${nome} não saiu do pote na tela do outro capitão`);
    }

    for (const tela of [pagina, outra]) {
      await tela.getByText('Draft fechado').waitFor({ timeout: 15000 });
      const cheios = await tela.getByText('5/5', { exact: true }).count();
      exigir(cheios === 2, `a sala fechou com ${cheios} de 2 times em 5/5 numa das telas`);
    }
    exigir(errosDoOutro.length === 0, `erro de JavaScript no outro capitão: ${errosDoOutro[0]}`);
  } finally {
    await outroNavegador.close();
  }
}

/**
 * Jogadores pela tela: cadastrar, editar e desativar. É o que se faz quando
 * alguém novo aparece na noite -- e o Riot ID é o que liga a pessoa à
 * importação, então o que sai da tela tem que chegar igual na API.
 */
async function fluxoDoCadastro(pagina) {
  if (!PREPARAR) return 'grava dados; rode com --preparar';
  const sufixo = Date.now().toString(36);
  const nome = `Fluxo ${sufixo}`;
  // Por rodada: o ensaio roda de novo no mesmo banco, e Riot ID não repete.
  const riotId = `Fluxo${sufixo}#BR1`;
  const daApi = async () =>
    (await api('GET', '/players?includeInactive=true')).find((p) => p.name === nome);

  await pagina.goto(`${BASE}/jogadores`, { waitUntil: 'networkidle' });
  const novo = pagina.locator('section', { has: pagina.getByText('Novo jogador') });
  await novo.getByPlaceholder('Como a galera chama').fill(nome);
  // A ordem do clique é a preferência: Top vira a main.
  await novo.getByRole('button', { name: /Top$/ }).click();
  await novo.getByRole('button', { name: /Mid$/ }).click();
  const primeira = (await novo.getByRole('button', { name: /Top$/ }).innerText()).trim();
  exigir(/^1\.\s*Top$/.test(primeira), `o primeiro clique mostrou "${primeira}", não "1. Top"`);
  await novo.getByRole('button', { name: /Cadastrar/ }).click();

  const linha = pagina.locator('li', {
    has: pagina.getByRole('link', { name: nome, exact: true }),
  });
  await linha.waitFor({ timeout: 20000 });
  let jogador = await daApi();
  exigir(
    JSON.stringify(jogador?.roles) === '["TOP","MID"]',
    `cadastrado com roles ${JSON.stringify(jogador?.roles)}`
  );
  exigir(
    (await linha.getByText('sem Riot ID', { exact: true }).count()) === 1,
    'cadastrado sem Riot ID e a linha não avisa'
  );

  // Editar: Riot ID e roles -- tira Top, põe Jungle, e Mid vira a main.
  await pagina.getByRole('button', { name: `Editar ${nome}` }).click();
  const edicao = pagina.locator('li', { has: pagina.getByRole('button', { name: 'Salvar' }) });
  await edicao.getByPlaceholder('Cangosul#PCBR').fill(riotId);
  await edicao.getByRole('button', { name: /Top$/ }).click();
  await edicao.getByRole('button', { name: /Jungle$/ }).click();
  await edicao.getByRole('button', { name: 'Salvar' }).click();
  await linha.getByText(riotId).waitFor({ timeout: 20000 });
  jogador = await daApi();
  exigir(jogador.riotId === riotId, `Riot ID na API: ${jogador.riotId}`);
  exigir(
    JSON.stringify(jogador.roles) === '["MID","JUNGLE"]',
    `roles na API depois de editar: ${JSON.stringify(jogador.roles)}`
  );

  // Desativar tira do Sorteio; a linha continua na lista, marcada.
  await pagina.getByRole('button', { name: `Desativar ${nome}` }).click();
  await linha.getByText('inativo', { exact: true }).waitFor({ timeout: 20000 });
  exigir((await daApi()).active === false, 'desativado na tela e ainda ativo na API');
  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  await pagina.locator('li > label').first().waitFor({ timeout: 20000 });
  exigir(
    (await pagina.getByText(nome, { exact: true }).count()) === 0,
    'o jogador desativado ainda aparece no Sorteio'
  );
}

async function fluxoDoSorteio(pagina) {
  if (!PREPARAR) return 'grava dados; rode com --preparar';
  await fecharMd3Aberta();

  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  await marcarVeteranos(pagina);

  await pagina.getByRole('button', { name: /Sortear times/ }).click();
  const usar = pagina.getByRole('button', { name: /Usar esses times na série/ });
  await usar.waitFor({ timeout: 20000 });
  await usar.click();
  await pagina.waitForURL(/\/serie$/, { timeout: 20000 });

  const atual = await api('GET', '/series/current');
  exigir(atual?.status === 'ONGOING', 'foi para a Série, mas não há MD3 em andamento');
  // Não deixa a MD3 do teste aberta: o próximo passo de quem roda isto na mão
  // pode ser o ensaio, que abre a dele.
  await api('POST', `/series/${atual.id}/finish`);
}

/**
 * Quanto um menu aberto passa do que dá para ver: da janela e da borda de cada
 * ancestral que corta ou rola. O formulário mora numa tabela com
 * `overflow-x-auto`, que também corta na vertical, dentro de um card com
 * `overflow-hidden` -- um menu preso ali abria escondido nas últimas linhas.
 */
function excessoDoMenu(menu) {
  const caixa = menu.getBoundingClientRect();
  let excesso = Math.max(
    caixa.bottom - window.innerHeight,
    caixa.right - window.innerWidth,
    -caixa.top
  );
  for (let no = menu.parentElement; no; no = no.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(no);
    if (/(auto|scroll|hidden|clip)/.test(`${overflowX} ${overflowY}`)) {
      const borda = no.getBoundingClientRect();
      excesso = Math.max(
        excesso,
        caixa.bottom - borda.bottom,
        caixa.right - borda.right,
        borda.top - caixa.top
      );
    }
  }
  return Math.max(0, Math.round(excesso));
}

/**
 * Mede o menu aberto depois da animação de entrada (`.surgir`, 220ms), e
 * quanto a tabela rolou por dentro -- o Select rolava para mostrar a opção
 * ativa, e isso escondia o corte de quem medisse na hora.
 */
async function medirMenuAberto(pagina, linha) {
  await pagina.waitForTimeout(300);
  const excesso = await pagina.getByRole('listbox').evaluate(excessoDoMenu);
  const rolou = await linha.evaluate((tr) => tr.closest('.overflow-x-auto')?.scrollTop ?? 0);
  return { excesso, rolou };
}

/**
 * O formulário manual da Série. É caminho de primeira classe (a API da Riot
 * não lista custom game) e é o que se usa quando o agente não rodou: abre a MD3
 * pela tela, registra o jogo 1 escolhendo cada linha na mão, confere placar e
 * API, e vê o Fearless recusar no jogo 2 um campeão do jogo 1.
 */
async function fluxoDoRegistroManual(pagina) {
  if (!PREPARAR) return 'grava dados; rode com --preparar';
  await fecharMd3Aberta();
  const veteranos = (await api('GET', '/players'))
    .filter((p) => p.active && !SOBRA.test(p.name))
    .slice(0, 10);
  exigir(veteranos.length === 10, `só há ${veteranos.length} veteranos`);
  const campeoes = ['Garen', 'Amumu', 'Annie', 'Ashe', 'Leona'].concat([
    'Darius',
    'Warwick',
    'Lux',
    'Caitlyn',
    'Braum',
  ]);

  await pagina.goto(`${BASE}/serie`, { waitUntil: 'networkidle' });
  await pagina.getByRole('button', { name: /Abrir nova MD3/ }).click();
  const registrar = pagina.getByRole('button', { name: 'Registrar jogo 1' });
  await registrar.waitFor({ timeout: 20000 });
  // Times de um sorteio anterior preencheriam as linhas; aqui cada uma é
  // escolhida na mão.
  const descartar = pagina.getByRole('button', { name: 'descartar' });
  if ((await descartar.count()) > 0) await descartar.click();
  await registrar.click();

  const formulario = pagina.locator('section', { has: pagina.getByText('Quem venceu?') });
  await formulario.getByRole('button', { name: 'Azul', exact: true }).click();
  await formulario.getByPlaceholder('30').fill('31');

  const linhas = formulario.locator('tbody tr');
  for (let i = 0; i < 10; i++) {
    const linha = linhas.nth(i);
    await linha.getByRole('combobox').click();
    // A última linha é a que tem menos espaço embaixo: é onde o menu corta.
    if (i === 9) {
      const { excesso, rolou } = await medirMenuAberto(pagina, linha);
      exigir(excesso === 0, `o menu de jogadores da última linha sai ${excesso}px cortado`);
      exigir(rolou === 0, `abrir o menu de jogadores rolou a tabela por dentro (${rolou}px)`);
    }
    await pagina.getByRole('option', { name: veteranos[i].name, exact: true }).click();

    const campeao = linha.locator('input').first();
    await campeao.fill(campeoes[i]);
    if (i === 9) {
      const { excesso, rolou } = await medirMenuAberto(pagina, linha);
      exigir(excesso === 0, `a lista de campeões da última linha sai ${excesso}px cortada`);
      exigir(rolou === 0, `abrir a lista de campeões rolou a tabela por dentro (${rolou}px)`);
    }
    await campeao.press('Enter');
    const ficou = await campeao.inputValue();
    exigir(ficou === campeoes[i], `linha ${i + 1}: o campeão ficou "${ficou}"`);
    await linha.getByRole('textbox', { name: /^kills de/ }).fill(String(i + 1));
  }

  await formulario.getByRole('button', { name: /Salvar partida/ }).click();
  await pagina.getByText('Jogos da série (1)').waitFor({ timeout: 20000 });
  const atual = await api('GET', '/series/current');
  exigir(atual?.matches.length === 1, 'a API não tem o jogo 1');
  exigir(
    atual.blueScore === 1 && atual.redScore === 0,
    `placar ${atual.blueScore}x${atual.redScore} depois do azul vencer o jogo 1`
  );

  // Fearless: quem jogou o jogo 1 aparece bloqueado, com o motivo.
  await pagina.getByRole('button', { name: 'Registrar jogo 2' }).click();
  const campeao = formulario.locator('tbody tr').first().locator('input').first();
  await campeao.fill(campeoes[0]);
  const opcao = pagina.getByRole('option', { name: new RegExp(`^${campeoes[0]}`) });
  exigir(await opcao.isDisabled(), `${campeoes[0]} jogou o jogo 1 e o jogo 2 deixa escolher`);
  exigir(/queimado/i.test(await opcao.innerText()), 'o campeão bloqueado não diz "queimado"');
  await campeao.press('Enter');
  await campeao.press('Escape');
  exigir((await campeao.inputValue()) === '', 'Enter num campeão queimado preencheu a linha');
  await formulario.getByRole('button', { name: 'Cancelar' }).click();

  await pagina.getByRole('button', { name: /Encerrar/ }).click();
  await pagina.getByText('Nenhuma MD3 em andamento.').waitFor({ timeout: 20000 });
  exigir((await api('GET', '/series/current')) === null, '"Encerrar" não fechou a MD3');
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  if (PREPARAR) {
    console.log('preparando cenário...');
    await garantirDuasNoites();
  }

  const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
  const contexto = await navegador.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  // A chave do grupo fica no navegador, como para quem já digitou uma vez.
  if (CHAVE) {
    await contexto.addInitScript((chave) => {
      try {
        localStorage.setItem('inhouse:chave-do-grupo', chave);
      } catch {
        // navegador sem storage: o fluxo que grava vai falhar e dizer por quê
      }
    }, CHAVE);
  }

  const passos = [
    ['Destaques: o seletor chega em todas as noites e filtra a tela', fluxoDosMomentos],
    ['Histórico: abre série, jogo e jogador; as imagens baixam', fluxoDoHistorico],
    ['Ranking: a imagem baixa', fluxoDoRanking],
    ['Ranking: cada ordenação deixa a tabela na ordem da API', fluxoDaOrdenacao],
    ['Jogadores: cada filtro mostra quantos a API diz que faltam', fluxoDosFiltros],
    ['Sorteio: "tenta outro" traz outro sorteio', fluxoDoSorteioDeNovo],
    ['Sorteio: capitães escolhidos na mão, draft fecha 5x5', fluxoDosCapitaes],
    ['Ajuda: o "?" leva para "Como funciona"', fluxoDaAjuda],
    ['Sorteio: usar os times abre a MD3 e leva para a Série', fluxoDoSorteio],
    [
      'Série: registrar o jogo pelo formulário, Fearless no jogo 2, encerrar',
      fluxoDoRegistroManual,
    ],
    ['Sala ao vivo: dois capitães, a vez trava o pote, escolhas sincronizam', fluxoDaSalaAoVivo],
    ['Jogadores: cadastrar, editar Riot ID e roles, desativar', fluxoDoCadastro],
  ];
  for (const [nome, fn] of passos) {
    const pagina = await contexto.newPage();
    const errosDaPagina = [];
    pagina.on('pageerror', (erro) => errosDaPagina.push(erro.message));
    await fluxo(nome, async () => {
      const resultado = await fn(pagina);
      exigir(errosDaPagina.length === 0, `erro de JavaScript na página: ${errosDaPagina[0]}`);
      return resultado;
    });
    await pagina.close();
  }

  await navegador.close();
  console.log(falhas ? `\n${falhas} fluxo(s) com problema.` : '\nTodos os fluxos ok.');
  process.exit(falhas ? 1 : 0);
}

main().catch((erro) => {
  console.error(`não consegui rodar os fluxos: ${erro.message}`);
  process.exit(2);
});
