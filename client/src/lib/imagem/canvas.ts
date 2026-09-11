import type { ChampionManifest } from '../../types';

/**
 * A base comum de toda imagem exportada: ranking, partida, série, destaques.
 *
 * DESENHADAS em canvas, não são print do DOM -- o porquê está em
 * `rankingImage.ts`, a primeira delas. Aqui mora só o que as quatro dividem:
 * cores, fonte, ícone, a marca no topo, o rodapé com o endereço e a entrega
 * (copiar, baixar, enviar). Assim a mesma pessoa, o mesmo campeão e o mesmo
 * dourado saem iguais em qualquer imagem que alguém mande no grupo.
 *
 * O app não carrega webfont -- usa a fonte do sistema -- então o canvas bate
 * com a tela sem precisar esperar `document.fonts.ready`.
 */

/** Desenha em 2x e reduz na exibição: sem isso, sai borrado em tela retina. */
const ESCALA = 2;

export const LARGURA = 900;
export const MARGEM = 36;

// Mesmos valores dos tokens em index.css. Repetidos porque canvas não lê CSS
// custom property -- se um mudar lá, muda aqui.
export const COR = {
  fundo: '#0d1420',
  fundoAlterna: '#131c2b',
  /** Faixa do time que venceu: o verde de vitória a ~10% sobre o fundo. */
  fundoVitoria: '#12282c',
  linha: '#22304a',
  texto: '#e9eef7',
  apagado: '#aab8cd',
  fraco: '#7d8da8',
  ouro: '#d4b26a',
  vitoria: '#3ddc97',
  derrota: '#ff6b6b',
  aviso: '#ffc46b',
  prata: '#cbd5e1',
  bronze: '#cd7f32',
  azul: '#4a9eff',
  vermelho: '#ff5c5c',
};

const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';

/** A cor com transparência -- para etiquetas tingidas ("#d4b26a" + 0.16). */
export function comAlfa(hex: string, alfa: number): string {
  const valor = parseInt(hex.slice(1), 16);
  return `rgba(${(valor >> 16) & 255}, ${(valor >> 8) & 255}, ${valor & 255}, ${alfa})`;
}

export const fonte = (tamanho: number, peso: 400 | 600 | 700 = 400) =>
  `${peso} ${tamanho}px ${FONTE}`;

/** Resolve o nome do campeão para a URL do ícone. Null = sem ícone. */
export type ResolverIcone = (championName: string) => string | null;

/**
 * Resolvedor a partir do manifesto do Data Dragon. Monta o índice uma vez: a
 * imagem da série pede 30 ícones, e um `.find` por ícone varreria 170
 * campeões 30 vezes.
 */
export function resolvedorDeIcone(manifest: ChampionManifest | null | undefined): ResolverIcone {
  const porNome = new Map(
    (manifest?.champions ?? []).map((c) => [c.name.toLowerCase(), c.squareUrl] as const)
  );
  return (nome) => porNome.get(nome.toLowerCase()) ?? null;
}

/**
 * Carrega um ícone para o canvas.
 *
 * `crossOrigin` é obrigatório: sem ele o navegador desenha a imagem mas marca o
 * canvas como "sujo", e `toBlob` passa a lançar em vez de exportar. O Data
 * Dragon responde `access-control-allow-origin: *`, então isso funciona.
 *
 * Falha vira null em vez de erro: um ícone que não carregou não pode impedir a
 * imagem inteira de sair.
 */
export function carregarIcone(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Carrega os ícones de vários campeões de uma vez, sem repetir. Em série, 30
 * requisições sequenciais deixariam o botão travado por segundos.
 */
export async function carregarIcones(
  nomes: string[],
  resolver: ResolverIcone
): Promise<Map<string, HTMLImageElement | null>> {
  const icones = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...new Set(nomes.filter(Boolean))].map(async (nome) => {
      const url = resolver(nome);
      icones.set(nome, url ? await carregarIcone(url) : null);
    })
  );
  return icones;
}

/** Encurta com reticências até caber na largura dada. */
export function cortar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;

  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte.trimEnd()}…`;
}

/** Retângulo com cantos arredondados -- `roundRect` não existe em Safari antigo. */
export function caixa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number
) {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
  ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
  ctx.arcTo(x, y + altura, x, y, raio);
  ctx.arcTo(x, y, x + largura, y, raio);
  ctx.closePath();
}

/**
 * Ícone quadrado de canto arredondado. Sem imagem, um quadrado vazio no lugar:
 * um buraco na fileira de campeões leria como erro, e desalinharia o resto.
 */
export function desenharIcone(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  tamanho: number
) {
  const raio = Math.round(tamanho / 5);
  ctx.save();
  caixa(ctx, x, y, tamanho, tamanho, raio);
  if (img) {
    ctx.clip();
    ctx.drawImage(img, x, y, tamanho, tamanho);
  } else {
    ctx.fillStyle = COR.linha;
    ctx.fill();
  }
  ctx.restore();
}

/** Canvas em 2x, já com o fundo pintado. */
export function criarCanvas(altura: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não suporta canvas 2D.');
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);

  // Brilho dourado atrás da marca e um filete de ouro na borda de cima: é o
  // que faz a imagem ser reconhecida como "do InHouse" no meio da conversa,
  // antes de alguém ler qualquer coisa. Fraco o bastante para não mexer no
  // contraste do texto por cima.
  const brilho = ctx.createRadialGradient(140, 0, 0, 140, 0, 620);
  brilho.addColorStop(0, 'rgba(212, 178, 106, 0.16)');
  brilho.addColorStop(1, 'rgba(212, 178, 106, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, LARGURA, altura);
  ctx.fillStyle = COR.ouro;
  ctx.fillRect(0, 0, LARGURA, 4);

  return { canvas, ctx };
}

/** "InHouse LoL" no topo, o assunto embaixo e, à direita, a data ou o detalhe. */
export function desenharMarca(ctx: CanvasRenderingContext2D, assunto: string, direita: string) {
  ctx.textBaseline = 'alphabetic';

  ctx.font = fonte(34, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText('InHouse', MARGEM, 58);
  const larguraInhouse = ctx.measureText('InHouse ').width;
  ctx.fillStyle = COR.ouro;
  ctx.fillText('LoL', MARGEM + larguraInhouse, 58);

  ctx.font = fonte(15);
  ctx.textAlign = 'right';
  ctx.fillStyle = COR.fraco;
  ctx.fillText(direita, LARGURA - MARGEM, 84);
  const larguraDaDireita = ctx.measureText(direita).width;
  ctx.textAlign = 'left';

  ctx.fillStyle = COR.apagado;
  ctx.fillText(cortar(ctx, assunto, LARGURA - MARGEM * 2 - larguraDaDireita - 24), MARGEM, 84);
}

/** Nota à esquerda e o endereço à direita -- quem recebe no zap precisa saber onde ver o resto. */
export function desenharRodape(ctx: CanvasRenderingContext2D, altura: number, nota: string) {
  // Um fio separa o rodapé do conteúdo: sem ele o endereço parecia mais uma
  // linha da tabela.
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM, altura - 44);
  ctx.lineTo(LARGURA - MARGEM, altura - 44);
  ctx.stroke();

  const y = altura - 20;
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(13);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(nota, MARGEM, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = COR.ouro;
  ctx.fillText('inhouse-lol.vercel.app', LARGURA - MARGEM, y);
  ctx.textAlign = 'left';
}

export function paraPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não consegui gerar a imagem.'))),
      'image/png'
    );
  });
}

/** "31 min"; null quando a fonte não sabe a duração. */
export function duracao(segundos: number | null): string | null {
  return segundos == null ? null : `${Math.round(segundos / 60)} min`;
}

/** Dano e ouro do jeito que o jogo mostra: "12.3k", sem ".0" sobrando. */
export function milhar(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

// ---------------------------------------------------------------------------
// ENTREGA DA IMAGEM
//
// A primeira versão usava `navigator.share` sempre que ele existisse. Erro: o
// Chrome e o Edge no WINDOWS também expõem `share`, e lá ele abre a folha de
// compartilhamento do sistema -- que lista Discord, Outlook, Teams... e não tem
// "salvar" nem "copiar". Ou seja, no desktop o caminho que parecia mais
// conveniente era justamente o que impedia usar a imagem.
//
// A correção não é detectar melhor o aparelho, é parar de adivinhar: cada ação
// tem botão próprio, e o compartilhar só aparece onde ele de fato é o melhor
// caminho -- na tela de toque, onde abre direto a lista de conversas.
// ---------------------------------------------------------------------------

/** Aparelho de toque: é onde a folha de compartilhamento vale a pena. */
export function ehTelaDeToque(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

export function podeCopiarImagem(): boolean {
  return typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write;
}

/**
 * Copia para a área de transferência -- o caminho mais curto no desktop: cola
 * direto no WhatsApp Web, no Discord ou onde for.
 *
 * Recebe a FUNÇÃO que gera, não o blob pronto: o navegador só aceita escrever
 * na área de transferência durante o gesto do usuário, e gerar a imagem antes
 * (com download de ícone no meio) já estoura esse prazo. Passando a promessa
 * para o `ClipboardItem`, quem espera é o próprio navegador.
 */
export async function copiarImagem(gerarBlob: () => Promise<Blob>): Promise<void> {
  if (!podeCopiarImagem()) {
    throw new Error('Este navegador não permite copiar imagem. Use "Baixar".');
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': gerarBlob() })]);
}

export function baixarImagem(blob: Blob, nomeDoArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeDoArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora corta o download em alguns navegadores; o quadro seguinte
  // já é depois de o clique ter sido processado.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Abre a folha de compartilhamento. Só faz sentido em tela de toque. */
export async function compartilharImagem(
  blob: Blob,
  nomeDoArquivo: string,
  titulo = 'InHouse LoL'
): Promise<void> {
  const arquivo = new File([blob], nomeDoArquivo, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [arquivo] })) {
    throw new Error('Este aparelho não permite compartilhar arquivo.');
  }

  try {
    await navigator.share({ files: [arquivo], title: titulo });
  } catch (erro) {
    // Fechar a folha de compartilhamento lança AbortError. Não é falha.
    if (!(erro instanceof Error) || erro.name !== 'AbortError') throw erro;
  }
}
