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
 *   3. Ranking: a imagem baixa.
 *   4. Ajuda: o "?" do cabeçalho leva para "Como funciona".
 *   5. Sorteio → Série (só com --preparar): marcar 10, sortear, "Usar esses
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

  // O nível do jogador: abre e mostra o detalhe.
  const jogador = pagina
    .locator('li:has(> div > button[aria-expanded="true"]) li > button[aria-expanded="false"]')
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

async function fluxoDoSorteio(pagina) {
  if (!PREPARAR) return 'grava dados; rode com --preparar';
  await fecharMd3Aberta();

  await pagina.goto(`${BASE}/sorteio`, { waitUntil: 'networkidle' });
  const linhas = pagina.locator('li > label');
  await linhas.first().waitFor({ timeout: 20000 });
  let marcados = 0;
  for (let i = 0; i < (await linhas.count()) && marcados < 10; i++) {
    const nome = (await linhas.nth(i).innerText()).split('\n')[0].trim();
    if (SOBRA.test(nome)) continue;
    await linhas.nth(i).click();
    marcados++;
  }
  exigir(marcados === 10, `só achei ${marcados} veteranos para marcar`);

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
