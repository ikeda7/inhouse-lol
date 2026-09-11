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
 *
 * Uso (servidor servindo API e front no mesmo endereço):
 *
 *   node client/e2e/fluxos.mjs --base http://localhost:3333 --preparar
 *
 *   --preparar   GRAVA: garante duas noites com momentos (o seletor de noite
 *                precisa de mais de uma) e abre uma MD3 pelo Sorteio. Recusa
 *                servidor que não seja local.
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
  // Com as quatro ordens iguais, uma aba que não faz nada passaria.
  exigir(
    new Set(ordens.map((ordem) => ordem.join('|'))).size > 1,
    'as quatro ordens da API são iguais: não dá para ver a tabela reordenar'
  );

  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const grupo = pagina.getByRole('group', { name: 'Ordenar por' });
  const nomesNaTabela = pagina.locator('table tbody tr td:nth-child(2) a');
  for (const [indice, [, rotulo]] of ORDENACOES.entries()) {
    const botao = grupo.getByRole('button', { name: rotulo, exact: true });
    await botao.click();
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
