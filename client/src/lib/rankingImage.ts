import type { LeaderboardEntry } from '../types';

/**
 * A tabela do ranking como imagem, para mandar no grupo (issue #7).
 *
 * DESENHADA em canvas, não é print do DOM. Duas razões:
 *
 * 1. Nenhuma dependência nova. Bibliotecas de screenshot pesam ~50kb, tropeçam
 *    em fonte e em imagem de outro domínio, e ainda produzem uma cópia do
 *    layout da tela -- que foi desenhado para um monitor, não para um balão de
 *    conversa.
 *
 * 2. O meio é outro. No zap a imagem é vista pequena, no telefone, sem zoom.
 *    Aqui isso é o requisito: menos colunas que a tabela, número grande, e
 *    contraste alto. Copiar a tela daria uma tabela de 12 colunas ilegível.
 *
 * O app não carrega webfont -- usa a fonte do sistema -- então o canvas bate
 * com a tela sem precisar esperar `document.fonts.ready`.
 */

/** Desenha em 2x e reduz na exibição: sem isso, sai borrado em tela retina. */
const ESCALA = 2;

const LARGURA = 900;
const MARGEM = 36;
const ALTURA_LINHA = 62;
const ALTURA_CABECALHO = 130;
const ALTURA_RODAPE = 56;

/** Quantos entram na imagem. Além disso a imagem fica alta demais para o zap. */
const MAX_LINHAS = 15;

/** Largura reservada à direita para V–D, WR, KDA e PTS. */
const RESERVA_DAS_COLUNAS = 360;

const COR = {
  fundo: '#0d1420',
  fundoAlterna: '#131c2b',
  linha: '#22304a',
  texto: '#e9eef7',
  apagado: '#93a3bd',
  fraco: '#5c6b85',
  ouro: '#d4b26a',
  vitoria: '#3ddc97',
  derrota: '#ff6b6b',
  prata: '#cbd5e1',
  bronze: '#b45309',
};

const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';

const fonte = (tamanho: number, peso: 400 | 600 | 700 = 400) =>
  `${peso} ${tamanho}px ${FONTE}`;

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
function carregarIcone(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Encurta com reticências até caber na largura dada. */
function cortar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;

  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte.trimEnd()}…`;
}

function medalha(posicao: number): string {
  if (posicao === 0) return COR.ouro;
  if (posicao === 1) return COR.prata;
  if (posicao === 2) return COR.bronze;
  return COR.fraco;
}

/** Retângulo com cantos arredondados -- `roundRect` não existe em Safari antigo. */
function caixa(
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

export interface OpcoesDaImagem {
  /** Resolve o nome do campeão para a URL do ícone. Null = sem ícone. */
  iconeDoCampeao: (championName: string) => string | null;
  /** Rótulo do critério de ordenação, para a imagem dizer como foi ordenada. */
  ordenadoPor: string;
}

export async function gerarImagemDoRanking(
  entries: LeaderboardEntry[],
  opcoes: OpcoesDaImagem
): Promise<Blob> {
  const linhas = entries.slice(0, MAX_LINHAS);
  const altura = ALTURA_CABECALHO + linhas.length * ALTURA_LINHA + ALTURA_RODAPE;

  const canvas = document.createElement('canvas');
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não suporta canvas 2D.');
  ctx.scale(ESCALA, ESCALA);

  // Os ícones vêm todos de uma vez: em série, 45 requisições sequenciais
  // deixariam o botão travado por segundos.
  const icones = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...new Set(linhas.flatMap((e) => e.topChampions.map((c) => c.championName)))].map(
      async (nome) => {
        const url = opcoes.iconeDoCampeao(nome);
        icones.set(nome, url ? await carregarIcone(url) : null);
      }
    )
  );

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);

  desenharCabecalho(ctx, opcoes.ordenadoPor);

  linhas.forEach((entry, index) => {
    desenharLinha(ctx, entry, index, icones);
  });

  desenharRodape(ctx, altura, entries.length);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não consegui gerar a imagem.'))),
      'image/png'
    );
  });
}

function desenharCabecalho(ctx: CanvasRenderingContext2D, ordenadoPor: string) {
  ctx.textBaseline = 'alphabetic';

  ctx.font = fonte(34, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText('InHouse', MARGEM, 58);
  const larguraInhouse = ctx.measureText('InHouse ').width;
  ctx.fillStyle = COR.ouro;
  ctx.fillText('LoL', MARGEM + larguraInhouse, 58);

  ctx.font = fonte(15);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`Classificação geral · por ${ordenadoPor.toLowerCase()}`, MARGEM, 84);

  ctx.textAlign = 'right';
  ctx.fillStyle = COR.fraco;
  ctx.fillText(
    new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    LARGURA - MARGEM,
    84
  );
  ctx.textAlign = 'left';

  // Cabeçalho de coluna. Só o essencial: no telefone, coluna a mais é ruído.
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('JOGADOR', MARGEM + 44, ALTURA_CABECALHO - 16);
  ctx.textAlign = 'right';
  ctx.fillText('V–D', LARGURA - MARGEM - 300, ALTURA_CABECALHO - 16);
  ctx.fillText('WR', LARGURA - MARGEM - 210, ALTURA_CABECALHO - 16);
  ctx.fillText('KDA', LARGURA - MARGEM - 110, ALTURA_CABECALHO - 16);
  ctx.fillText('PTS', LARGURA - MARGEM, ALTURA_CABECALHO - 16);
  ctx.textAlign = 'left';

  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM, ALTURA_CABECALHO - 4);
  ctx.lineTo(LARGURA - MARGEM, ALTURA_CABECALHO - 4);
  ctx.stroke();
}

function desenharLinha(
  ctx: CanvasRenderingContext2D,
  entry: LeaderboardEntry,
  index: number,
  icones: Map<string, HTMLImageElement | null>
) {
  const topo = ALTURA_CABECALHO + index * ALTURA_LINHA;
  const meio = topo + ALTURA_LINHA / 2;

  // Faixa alternada em vez de linha divisória: em imagem pequena, a faixa
  // segura o olho na horizontal melhor que um traço fino.
  if (index % 2 === 0) {
    ctx.fillStyle = COR.fundoAlterna;
    caixa(ctx, MARGEM - 10, topo, LARGURA - MARGEM * 2 + 20, ALTURA_LINHA, 8);
    ctx.fill();
  }

  ctx.textBaseline = 'middle';

  ctx.font = fonte(20, 700);
  ctx.fillStyle = medalha(index);
  ctx.textAlign = 'center';
  ctx.fillText(String(index + 1), MARGEM + 14, meio);
  ctx.textAlign = 'left';

  let x = MARGEM + 44;
  const TAMANHO_ICONE = 30;
  for (const champion of entry.topChampions.slice(0, 3)) {
    const img = icones.get(champion.championName);
    if (img) {
      ctx.save();
      caixa(ctx, x, meio - TAMANHO_ICONE / 2, TAMANHO_ICONE, TAMANHO_ICONE, 6);
      ctx.clip();
      ctx.drawImage(img, x, meio - TAMANHO_ICONE / 2, TAMANHO_ICONE, TAMANHO_ICONE);
      ctx.restore();
    }
    x += TAMANHO_ICONE + 5;
  }

  const nome =
    entry.name + (entry.seriesWon > 0 ? ` ${'🏆'.repeat(Math.min(entry.seriesWon, 3))}` : '');
  const xDoNome = MARGEM + 44 + 3 * (TAMANHO_ICONE + 5) + 8;
  ctx.font = fonte(19, 600);
  ctx.fillStyle = COR.texto;
  // Canvas não quebra nem corta texto sozinho: um nome longo passaria por cima
  // da coluna de vitórias sem aviso nenhum. A reserva de 360 sai da conta do
  // pior caso -- "12–10" alinhado à direita começa em 516, e o nome tem que
  // parar antes disso.
  ctx.fillText(cortar(ctx, nome, LARGURA - MARGEM - RESERVA_DAS_COLUNAS - xDoNome), xDoNome, meio);

  ctx.textAlign = 'right';

  ctx.font = fonte(17, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`${entry.wins}–${entry.losses}`, LARGURA - MARGEM - 300, meio);

  ctx.fillStyle = entry.winRate >= 50 ? COR.vitoria : COR.derrota;
  ctx.fillText(`${entry.winRate}%`, LARGURA - MARGEM - 210, meio);

  ctx.fillStyle = COR.texto;
  ctx.fillText(entry.avgKda.toFixed(2), LARGURA - MARGEM - 110, meio);

  ctx.font = fonte(24, 700);
  ctx.fillStyle = COR.ouro;
  ctx.fillText(String(entry.points), LARGURA - MARGEM, meio);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function desenharRodape(ctx: CanvasRenderingContext2D, altura: number, total: number) {
  const y = altura - 22;

  ctx.font = fonte(13);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('+3 por mapa vencido · +1 por MD3', MARGEM, y);

  ctx.textAlign = 'right';
  // Quem receber a imagem no zap precisa saber onde ver o resto.
  ctx.fillStyle = COR.ouro;
  ctx.fillText('inhouse-lol.vercel.app', LARGURA - MARGEM, y);
  ctx.textAlign = 'left';

  if (total > MAX_LINHAS) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.fraco;
    ctx.fillText(`e mais ${total - MAX_LINHAS} jogador(es)`, LARGURA / 2, y);
    ctx.textAlign = 'left';
  }
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
export async function compartilharImagem(blob: Blob, nomeDoArquivo: string): Promise<void> {
  const arquivo = new File([blob], nomeDoArquivo, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [arquivo] })) {
    throw new Error('Este aparelho não permite compartilhar arquivo.');
  }

  try {
    await navigator.share({ files: [arquivo], title: 'Classificação · InHouse LoL' });
  } catch (erro) {
    // Fechar a folha de compartilhamento lança AbortError. Não é falha.
    if (!(erro instanceof Error) || erro.name !== 'AbortError') throw erro;
  }
}
