import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardas do sistema de cores.
 *
 * Existem porque duas vezes seguidas a tela quebrou com typecheck limpo, 131
 * testes passando e build verde. Nenhuma das duas falhas era detectável lendo
 * o código:
 *
 * 1. `--color-base` fazia o Tailwind gerar uma utility de COR `text-base` com
 *    o mesmo nome da utility de TAMANHO DE FONTE. Quem escrevia `text-base`
 *    querendo 16px levava junto a cor de fundo mais escura da paleta. O nome
 *    da série no histórico ficou preto no preto por meses.
 *
 * 2. `text-ink-faint/70` mantém o hexadecimal certo e mesmo assim reprova AA --
 *    o alpha só derruba a razão na hora de compor com o fundo. Procurar pelo
 *    hex antigo nunca acha.
 *
 * Os dois são verificáveis sem navegador: basta ler os tokens do CSS e fazer a
 * conta. Um teste é mais barato que descobrir na tela três semanas depois.
 */

/**
 * `import.meta.url` não é `file://` sob jsdom, então o caminho sai do cwd. O
 * vitest roda no workspace, mas aceita as duas raízes para o caso de alguém
 * chamar da raiz do monorepo.
 */
function acharCss(): string {
  const candidatos = [
    resolve(process.cwd(), 'src/index.css'),
    resolve(process.cwd(), 'client/src/index.css'),
  ];
  const achado = candidatos.find((caminho) => existsSync(caminho));
  if (!achado) {
    throw new Error(`index.css não encontrado. Procurei em:\n${candidatos.join('\n')}`);
  }
  return readFileSync(achado, 'utf8');
}

const CSS = acharCss();

/** Lê `--color-x: #rrggbb` do bloco `@theme`. */
function lerTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, nome, valor] of CSS.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[nome] = valor.toLowerCase();
  }
  return tokens;
}

const TOKENS = lerTokens();

/**
 * Utilities do Tailwind cujo nome, virando token de cor, produz duas regras
 * `.text-<nome>` diferentes -- e a de cor ganha na cascata.
 *
 * Só a família `text-*` importa: é a única em que o Tailwind usa o mesmo
 * prefixo para cor e para outra coisa (tamanho de fonte).
 */
const TAMANHOS_DE_FONTE = [
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
];

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

describe('tokens de cor', () => {
  it('lê a paleta do index.css', () => {
    // Se este quebrar, o formato do @theme mudou e os outros testes viram
    // falso-positivo silencioso -- passariam com zero tokens para conferir.
    expect(Object.keys(TOKENS).length).toBeGreaterThan(10);
    expect(TOKENS).toHaveProperty('ink');
    expect(TOKENS).toHaveProperty('canvas');
  });

  it('nenhum token colide com uma utility de tamanho de fonte do Tailwind', () => {
    const colisoes = Object.keys(TOKENS).filter((nome) => TAMANHOS_DE_FONTE.includes(nome));

    expect(
      colisoes,
      `--color-${colisoes.join(', --color-')}: este nome também é uma utility de ` +
        'tamanho de fonte. As duas regras .text-<nome> convivem no CSS e a de cor ' +
        'ganha, então quem escrever text-<nome> querendo tamanho vai pintar o texto ' +
        'com essa cor sem receber erro nenhum. Escolha outro nome para o token.'
    ).toEqual([]);
  });
});

describe('contraste WCAG AA dos níveis de texto', () => {
  // O fundo MAIS CLARO em que texto corrido aparece. Passar aqui implica passar
  // nos mais escuros, que têm contraste maior contra texto claro.
  const PIOR_FUNDO = 'overlay';

  it.each([
    ['ink', 4.5],
    ['ink-muted', 4.5],
    ['ink-faint', 4.5],
  ])('%s passa AA (%s:1) sobre o overlay', (token, minimo) => {
    const razao = contraste(TOKENS[token], TOKENS[PIOR_FUNDO]);
    expect(
      Number(razao.toFixed(2)),
      `--color-${token} (${TOKENS[token]}) dá ${razao.toFixed(2)}:1 sobre ` +
        `--color-${PIOR_FUNDO} (${TOKENS[PIOR_FUNDO]}). Medir, não achar bonito.`
    ).toBeGreaterThanOrEqual(minimo);
  });

  it('mantém hierarquia visível entre os três níveis', () => {
    // Arrumar só o token mais fraco já aconteceu e encostou ele no do meio: os
    // três passavam AA e viravam a mesma cor na prática.
    const [ink, muted, faint] = ['ink', 'ink-muted', 'ink-faint'].map((t) =>
      luminancia(TOKENS[t])
    );
    expect(ink).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(faint);
    expect(contraste(TOKENS['ink'], TOKENS['ink-faint'])).toBeGreaterThan(1.5);
  });

  it('o pódio se distingue do fundo e entre si', () => {
    // 4.5 e não 3: a posição sai em `text-sm` (14px) na tabela do ranking, que
    // é texto NORMAL. A régua de 3:1 vale só para texto grande -- 18.66px em
    // negrito ou 24px -- e usá-la aqui deixaria passar justamente o caso que
    // motivou a troca: o bronze já foi amber-700, que dá 3.40:1 e deixava o
    // número do 3º lugar ilegível.
    for (const token of ['gold', 'silver', 'bronze']) {
      const razao = contraste(TOKENS[token], TOKENS['raised']);
      expect(
        Number(razao.toFixed(2)),
        `--color-${token} (${TOKENS[token]}) sobre raised`
      ).toBeGreaterThanOrEqual(4.5);
    }
    // Ouro e bronze são vizinhos no espectro; se encostarem, o pódio deixa de
    // ser lido como três posições distintas.
    expect(contraste(TOKENS['gold'], TOKENS['bronze'])).toBeGreaterThan(1.3);
  });

  it('texto escuro sobre o botão dourado passa AA', () => {
    // O botão primário é `bg-gold text-canvas`. Isso funcionava por acidente da
    // colisão de nomes; agora é explícito e fica verificado.
    const razao = contraste(TOKENS['canvas'], TOKENS['gold']);
    expect(Number(razao.toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });
});
