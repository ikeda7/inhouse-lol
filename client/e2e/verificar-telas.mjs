/**
 * Verificação das telas num navegador de verdade (issue #44).
 *
 * Existe porque três bugs de tela passaram por typecheck limpo, testes verdes
 * e build sem aviso -- e só apareceram quando alguém abriu o navegador:
 *
 *   - o nome da noite no Histórico pintado com a cor de FUNDO (preto no preto)
 *   - nomes no Sorteio a 3.4:1 por `opacity-40` na linha inteira
 *   - layout que PIORAVA conforme a tela crescia (84px a 700px, 40px a 820px)
 *
 * Nenhum dos três é detectável lendo código. Os três são detectáveis medindo a
 * tela renderizada, e é só isso que este script faz -- duas checagens que não
 * precisam de imagem de referência:
 *
 *   1. ROLAGEM LATERAL: `scrollWidth > clientWidth` em qualquer largura.
 *   2. CONTRASTE: a cor que o texto tem DEPOIS de compor opacidade e fundos,
 *      contra o fundo que ele tem de verdade, na régua do WCAG AA.
 *
 * Comparação de screenshot com baseline ficou de fora de propósito: exige
 * imagem versionada e sofre com ruído de renderização entre máquinas. As duas
 * checagens acima já teriam pego os três bugs e não têm nenhum desses custos.
 *
 * Uso (com o servidor servindo API e front no mesmo endereço):
 *
 *   node client/e2e/verificar-telas.mjs --base http://localhost:3333 --preparar
 *
 *   --preparar   cria o que as telas precisam para ter conteúdo (jogadores
 *                extras e uma série com duas partidas). Só use em banco
 *                descartável: grava dados.
 *   --saida DIR  onde guardar os screenshots (padrão: e2e-saida)
 *
 * Sai com 1 se achar problema, 2 se não conseguir nem montar o cenário.
 */

import { mkdirSync } from 'node:fs';
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
/** `--telas sorteio,historico` roda só essas -- para iterar sem esperar as sete. */
const SO_ESSAS = opcao('--telas', '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

/** As mesmas larguras em que os bugs de hoje apareceram. */
const LARGURAS = [390, 768, 1024, 1440];

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

async function api(metodo, rota, corpo) {
  const resposta = await fetch(`${BASE}/api${rota}`, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok || json.success === false) {
    throw new Error(`${metodo} ${rota} -> ${resposta.status} ${json.error ?? ''}`.trim());
  }
  return json.data;
}

const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

/**
 * Duas partidas com campeões diferentes: a série é Fearless, e repetir
 * campeão no jogo 2 seria recusado.
 */
const PARTIDAS = [
  ['Garen', 'Amumu', 'Ahri', 'Jinx', 'Thresh', 'Darius', 'Warwick', 'Lux', 'Caitlyn', 'Leona'],
  ['Nasus', 'Vi', 'Annie', 'Ashe', 'Nami', 'Sion', 'Sejuani', 'Syndra', 'Ezreal', 'Braum'],
];

function montarPartida(azul, vermelho, campeoes, indice) {
  const linha = (jogador, lado, posicao) => {
    // Números variados e determinísticos: barras de comparação e recordes
    // precisam de diferença entre as linhas para desenhar alguma coisa.
    const semente = posicao + indice * 10 + (lado === 'BLUE' ? 0 : 5);
    return {
      playerId: jogador.id,
      teamSide: lado,
      rolePlayed: ROLES[posicao],
      championName: campeoes[posicao + (lado === 'BLUE' ? 0 : 5)],
      kills: (semente * 3) % 14,
      deaths: (semente * 5) % 9,
      assists: (semente * 7) % 17,
      damage: 8000 + semente * 1900,
      damageTaken: 9000 + semente * 1300,
      goldEarned: 7000 + semente * 700,
      visionScore: 10 + semente * 4,
      cs: 40 + semente * 17,
    };
  };

  return {
    winner: 'BLUE',
    gameDurationSec: 1680 + indice * 240,
    players: [
      ...azul.map((j, i) => linha(j, 'BLUE', i)),
      ...vermelho.map((j, i) => linha(j, 'RED', i)),
    ],
  };
}

async function prepararCenario() {
  // Dois além dos dez: com exatamente dez, marcar todos no Sorteio não deixa
  // ninguém bloqueado -- e o bloqueado era justamente o estado que reprovava.
  const existentes = await api('GET', '/players');
  for (const [nome, roles] of [
    ['Reserva Um', ['FILL']],
    ['Reserva Dois', ['MID', 'ADC']],
  ]) {
    if (!existentes.some((p) => p.name === nome)) {
      await api('POST', '/players', { name: nome, roles, riotId: null });
    }
  }

  const series = await api('GET', '/series?limit=5');
  if (series.some((s) => s.matches.length > 0)) {
    console.log('  já existe série com partida -- cenário mantido como está');
    return;
  }

  const ativos = (await api('GET', '/players')).filter((p) => p.active);
  if (ativos.length < 10) {
    throw new Error(`preciso de 10 jogadores ativos e há ${ativos.length}. Rode o seed.`);
  }
  const azul = ativos.slice(0, 5);
  const vermelho = ativos.slice(5, 10);

  const atual = await api('GET', '/series/current');
  const serie =
    atual ?? (await api('POST', '/series', { name: 'Verificação de telas', fearless: true }));

  for (const [indice, campeoes] of PARTIDAS.entries()) {
    await api(
      'POST',
      `/series/${serie.id}/matches`,
      montarPartida(azul, vermelho, campeoes, indice)
    );
  }
  console.log(`  série "${serie.name ?? serie.id}" com ${PARTIDAS.length} partidas`);
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

/** Abre a primeira série e o primeiro jogador: o painel de detalhe é onde mais coisa quebrou. */
async function abrirSerieEJogador(pagina) {
  const serie = pagina.locator('li button[aria-expanded="false"]').first();
  if ((await serie.count()) === 0) return;
  await serie.click();
  const jogador = pagina
    .locator('li:has(> div > button[aria-expanded="true"]) button[aria-expanded="false"]')
    .first();
  await jogador.waitFor({ timeout: 10000 }).catch(() => {});
  if ((await jogador.count()) > 0) await jogador.click();
}

/** Marca dez: é o estado em que os que sobram ficam bloqueados. */
async function marcarDez(pagina) {
  const caixas = pagina.locator('input[type="checkbox"]');
  const total = Math.min(10, await caixas.count());
  for (let i = 0; i < total; i++) await caixas.nth(i).check();
}

/** O perfil não tem rota fixa: entra pelo primeiro jogador da lista. */
async function abrirPrimeiroPerfil(pagina) {
  const link = pagina.locator('a[href^="/jogadores/"]').first();
  if ((await link.count()) === 0) return;
  await link.click();
  await pagina.waitForURL(/\/jogadores\/.+/, { timeout: 10000 }).catch(() => {});
}

const TODAS_AS_TELAS = [
  { nome: 'ranking', rota: '/' },
  { nome: 'historico', rota: '/historico', antes: abrirSerieEJogador },
  { nome: 'destaques', rota: '/destaques' },
  { nome: 'sorteio', rota: '/sorteio', antes: marcarDez },
  { nome: 'serie', rota: '/serie' },
  { nome: 'jogadores', rota: '/jogadores' },
  { nome: 'perfil', rota: '/jogadores', antes: abrirPrimeiroPerfil },
];

// Nome errado no --telas precisa FALHAR. Sem isto, "--telas sorteo" rodaria
// zero telas e sairia com "0/0 sem problema" e código 0 -- um verde que não
// verificou nada, que é exatamente o tipo de passe que este script existe
// para acabar.
const desconhecidas = SO_ESSAS.filter((nome) => !TODAS_AS_TELAS.some((t) => t.nome === nome));
if (desconhecidas.length > 0) {
  console.error(
    `tela desconhecida: ${desconhecidas.join(', ')}. ` +
      `Existem: ${TODAS_AS_TELAS.map((t) => t.nome).join(', ')}.`
  );
  process.exit(2);
}

const TELAS = SO_ESSAS.length
  ? TODAS_AS_TELAS.filter((tela) => SO_ESSAS.includes(tela.nome))
  : TODAS_AS_TELAS;

// ---------------------------------------------------------------------------
// Medição (roda dentro da página)
// ---------------------------------------------------------------------------

/**
 * Tudo aqui roda no navegador, onde a cor final existe de verdade.
 *
 * A conversão de cor passa por um canvas de 1px: o Tailwind v4 gera cor com
 * `color-mix(in oklab, ...)`, e o computed style volta em `oklab(...)` ou
 * `color(srgb ...)`. Tentar ler isso com regex dá número errado em silêncio.
 * O canvas aceita qualquer cor que o navegador entende e devolve RGBA.
 */
function medirNaPagina() {
  const tela = document.createElement('canvas');
  tela.width = 1;
  tela.height = 1;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const misturar = (frente, fundo, a) => frente.map((c, i) => a * c + (1 - a) * fundo[i]);
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const razao = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /**
   * Fundo e texto compostos camada por camada, da raiz até o elemento.
   * A opacidade de cada ancestral multiplica o alfa das camadas dentro dele --
   * é assim que um `opacity-40` numa linha apaga o texto e o fundo juntos.
   */
  const corFinal = (el) => {
    const cadeia = [];
    for (let no = el; no; no = no.parentElement) cadeia.unshift(no);
    let fundo = [255, 255, 255];
    let opacidade = 1;
    for (const no of cadeia) {
      const estilo = getComputedStyle(no);
      opacidade *= Number(estilo.opacity);
      const [r, g, b, a] = rgba(estilo.backgroundColor);
      if (a > 0) fundo = misturar([r, g, b], fundo, a * opacidade);
    }
    const [r, g, b, a] = rgba(getComputedStyle(el).color);
    return { texto: misturar([r, g, b], fundo, a * opacidade), fundo };
  };

  // Controle desabilitado é isento na WCAG, e o que está escondido de todos
  // (aria-hidden, sr-only com 1px) não é lido por ninguém na tela.
  const isento = (el) =>
    el.closest('button:disabled, [aria-disabled="true"], [aria-hidden="true"], svg, script, style');
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const estilo = getComputedStyle(el);
    return estilo.visibility !== 'hidden' && estilo.display !== 'none';
  };

  const reprovados = [];
  const vistos = new Set();
  const percurso = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (percurso.nextNode()) {
    const noDeTexto = percurso.currentNode;
    if (!noDeTexto.textContent.trim()) continue;
    const el = noDeTexto.parentElement;
    if (!el || vistos.has(el)) continue;
    vistos.add(el);
    if (isento(el) || !visivel(el)) continue;

    const { texto, fundo } = corFinal(el);
    const r = razao(texto, fundo);
    const estilo = getComputedStyle(el);
    const px = parseFloat(estilo.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(estilo.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    if (r < minimo) {
      reprovados.push({
        texto: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48),
        razao: Number(r.toFixed(2)),
        minimo,
        px: Math.round(px),
        classe: String(el.className).split(' ').slice(0, 4).join('.'),
      });
    }
  }

  // Rolagem lateral: se a página rola, aponta quem está passando da borda --
  // ignorando o que mora dentro de um contêiner que rola de propósito.
  const limite = document.documentElement.clientWidth;
  let vazamento = null;
  if (document.documentElement.scrollWidth > limite + 1) {
    const rolaDeProposito = (el) => {
      for (let no = el.parentElement; no; no = no.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(no).overflowX)) return true;
      }
      return false;
    };
    let pior = null;
    for (const el of document.body.querySelectorAll('*')) {
      const direita = el.getBoundingClientRect().right;
      if (direita > limite + 1 && !rolaDeProposito(el) && (!pior || direita > pior.direita)) {
        pior = {
          direita,
          tag: el.tagName.toLowerCase(),
          classe: String(el.className).slice(0, 60),
        };
      }
    }
    vazamento = { largura: document.documentElement.scrollWidth, limite, culpado: pior };
  }

  return { reprovados, vazamento };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  if (PREPARAR) {
    console.log('preparando cenário...');
    await prepararCenario();
  }

  // CHROME_PATH permite usar um Chromium que já exista na máquina em vez de
  // baixar o que o playwright-core quer. No CI fica vazio e vale o instalado.
  const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );

  let falhas = 0;
  for (const tela of TELAS) {
    for (const largura of LARGURAS) {
      const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } });
      const rotulo = `${tela.nome.padEnd(10)} ${String(largura).padStart(4)}px`;
      try {
        await pagina.goto(BASE + tela.rota, { waitUntil: 'networkidle', timeout: 30000 });
        if (tela.antes) {
          await tela.antes(pagina);
          await pagina.waitForLoadState('networkidle').catch(() => {});
        }
        // Espera a animação de entrada dos cards (`.surgir`, 220ms) acabar:
        // medir no meio dela daria contraste de um frame que ninguém vê parado.
        await pagina.waitForTimeout(600);

        const { reprovados, vazamento } = await pagina.evaluate(medirNaPagina);
        await pagina.screenshot({
          path: join(SAIDA, `${tela.nome}-${largura}.png`),
          fullPage: true,
        });

        if (reprovados.length === 0 && !vazamento) {
          console.log(`  ok    ${rotulo}`);
        } else {
          falhas++;
          console.log(`  FALHA ${rotulo}`);
          if (vazamento) {
            const c = vazamento.culpado;
            console.log(
              `        rolagem lateral: ${vazamento.largura}px numa janela de ${vazamento.limite}px` +
                (c ? ` -- <${c.tag}> .${c.classe}` : '')
            );
          }
          for (const r of reprovados.slice(0, 8)) {
            console.log(
              `        ${r.razao}:1 (mín ${r.minimo}, ${r.px}px) "${r.texto}"  .${r.classe}`
            );
          }
          if (reprovados.length > 8) console.log(`        ... e mais ${reprovados.length - 8}`);
        }
      } catch (erro) {
        falhas++;
        console.log(`  ERRO  ${rotulo}: ${String(erro.message).split('\n')[0]}`);
      } finally {
        await pagina.close();
      }
    }
  }

  await navegador.close();

  const total = TELAS.length * LARGURAS.length;
  console.log(`\n${total - falhas}/${total} combinações de tela e largura sem problema.`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch((erro) => {
  console.error(`não consegui montar a verificação: ${erro.message}`);
  process.exit(2);
});
