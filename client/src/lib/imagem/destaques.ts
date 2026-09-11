import type { Highlights, RecordEntry } from '../../types';
import {
  caixa,
  carregarIcones,
  COR,
  cortar,
  criarCanvas,
  desenharIcone,
  desenharMarca,
  desenharRodape,
  fonte,
  LARGURA,
  MARGEM,
  paraPng,
  type ResolverIcone,
} from './canvas';
import { COR_DO_LADO } from './momentos';

/**
 * Os recordes do grupo como imagem -- a grade da aba Destaques.
 *
 * Os rótulos vêm da própria tela por parâmetro, e não são repetidos aqui: se a
 * tela mudar o texto, a imagem muda junto. Os momentos têm imagem própria
 * (momentos.ts), da noite inteira ou de um jogo só.
 *
 * Cada cartão diz ONDE o recorde foi feito (noite, jogo, campeão) e pinta a
 * faixa com a cor do lado daquele jogo: o grupo gosta de discutir o número, e
 * o número sem contexto não se discute.
 */

export interface OpcoesDosRecordes {
  iconeDoCampeao: ResolverIcone;
  /** Rótulo do recorde; null = categoria que a tela não mostra. */
  categoria: (chave: string) => { label: string; zoeira: boolean } | null;
}

const ALTURA_CABECALHO = 112;
const ALTURA_TITULO = 34;
const ALTURA_RECORDE = 86;
const ESPACO = 12;
const ALTURA_RODAPE = 56;
const ICONE = 50;

export async function gerarImagemDosRecordes(
  destaques: Highlights,
  opcoes: OpcoesDosRecordes
): Promise<Blob> {
  const recordes = destaques.recordes.filter((r) => opcoes.categoria(r.categoria) !== null);
  const linhas = Math.ceil(recordes.length / 2);

  const altura =
    ALTURA_CABECALHO + ALTURA_TITULO + linhas * (ALTURA_RECORDE + ESPACO) + ALTURA_RODAPE;

  const icones = await carregarIcones(
    recordes.map((r) => r.championName),
    opcoes.iconeDoCampeao
  );

  const { canvas, ctx } = criarCanvas(altura);
  desenharMarca(
    ctx,
    `Recordes · de ${destaques.partidas} partida${destaques.partidas === 1 ? '' : 's'}`,
    new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  );

  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('RECORDES DO GRUPO', MARGEM, ALTURA_CABECALHO + 22);

  const topo = ALTURA_CABECALHO + ALTURA_TITULO;
  const larguraDaMetade = (LARGURA - MARGEM * 2 - ESPACO) / 2;
  recordes.forEach((recorde, i) => {
    // Número ímpar de cartões: o último ocupa a linha inteira, para a grade
    // fechar sem buraco na segunda coluna.
    const sozinho = recordes.length % 2 === 1 && i === recordes.length - 1;
    const x = MARGEM + (i % 2) * (larguraDaMetade + ESPACO);
    const y = topo + Math.floor(i / 2) * (ALTURA_RECORDE + ESPACO);
    desenharRecorde(ctx, {
      recorde,
      x,
      y,
      largura: sozinho ? LARGURA - MARGEM * 2 : larguraDaMetade,
      icone: icones.get(recorde.championName),
      opcoes,
    });
  });

  desenharRodape(ctx, altura, 'Todo recorde aponta para uma partida de verdade');
  return paraPng(canvas);
}

function desenharRecorde(
  ctx: CanvasRenderingContext2D,
  {
    recorde,
    x,
    y,
    largura,
    icone,
    opcoes,
  }: {
    recorde: RecordEntry;
    x: number;
    y: number;
    largura: number;
    icone: HTMLImageElement | null | undefined;
    opcoes: OpcoesDosRecordes;
  }
) {
  const meta = opcoes.categoria(recorde.categoria);
  if (!meta) return;

  ctx.fillStyle = COR.fundoAlterna;
  caixa(ctx, x, y, largura, ALTURA_RECORDE, 12);
  ctx.fill();
  // Faixa do lado em que o recorde foi feito (os times trocam de lado na MD3).
  ctx.fillStyle = COR_DO_LADO[recorde.teamSide] ?? COR.linha;
  caixa(ctx, x, y, 4, ALTURA_RECORDE, 2);
  ctx.fill();

  const meio = y + ALTURA_RECORDE / 2;
  desenharIcone(ctx, icone, x + 16, meio - ICONE / 2, ICONE);

  // O número é o assunto do cartão; o texto para antes dele.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = fonte(28, 700);
  // "Mais mortes" sai do ouro: virar troféu de morte confundiria o que é mérito.
  ctx.fillStyle = meta.zoeira ? COR.derrota : COR.ouro;
  ctx.fillText(recorde.exibicao, x + largura - 16, meio);
  const larguraDoNumero = ctx.measureText(recorde.exibicao).width;
  ctx.textAlign = 'left';

  const xDoTexto = x + 16 + ICONE + 14;
  const larguraDoTexto = x + largura - 16 - larguraDoNumero - 14 - xDoTexto;
  ctx.font = fonte(11, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(cortar(ctx, meta.label.toUpperCase(), larguraDoTexto), xDoTexto, meio - 20);
  ctx.font = fonte(18, 600);
  ctx.fillStyle = COR.texto;
  ctx.fillText(cortar(ctx, recorde.playerName, larguraDoTexto), xDoTexto, meio);
  const quando = recorde.seriesName ?? new Date(recorde.playedAt).toLocaleDateString('pt-BR');
  ctx.font = fonte(12);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(
    cortar(
      ctx,
      `${quando} · Jogo ${recorde.matchNumber} · ${recorde.championName}`,
      larguraDoTexto
    ),
    xDoTexto,
    meio + 20
  );
  ctx.textBaseline = 'alphabetic';
}
