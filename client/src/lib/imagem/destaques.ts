import type { Highlights, MomentEntry, RecordEntry } from '../../types';
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

/**
 * Os destaques como imagem: os recordes em grade e os momentos da última
 * noite.
 *
 * Os textos (rótulo de cada recorde, "LEGENDARY", a frase do momento) vêm da
 * própria tela por parâmetro, e não são repetidos aqui: se a tela mudar a
 * frase, a imagem muda junto, e as duas nunca dizem coisas diferentes.
 */

export interface OpcoesDosDestaques {
  iconeDoCampeao: ResolverIcone;
  /** Rótulo do recorde; null = categoria que a tela não mostra. */
  categoria: (chave: string) => { label: string; zoeira: boolean } | null;
  momento: (momento: MomentEntry) => { titulo: string; frase: string; destaque: boolean };
}

const ALTURA_CABECALHO = 112;
const ALTURA_TITULO = 34;
const ALTURA_RECORDE = 70;
const ESPACO = 12;
const ALTURA_MOMENTO = 56;
const ALTURA_RODAPE = 50;
const ICONE_DO_RECORDE = 42;
const ICONE_DO_MOMENTO = 38;
/** Momentos da noite na imagem. Mais que isso vira rolagem, e imagem não rola. */
const MAX_MOMENTOS = 6;

export async function gerarImagemDosDestaques(
  destaques: Highlights,
  opcoes: OpcoesDosDestaques
): Promise<Blob> {
  const recordes = destaques.recordes.filter((r) => opcoes.categoria(r.categoria) !== null);
  const linhasDeRecordes = Math.ceil(recordes.length / 2);

  // Só a noite mais recente: os momentos chegam do mais novo para o mais velho.
  const noite = destaques.momentos[0]?.seriesId;
  const momentos = destaques.momentos.filter((m) => m.seriesId === noite).slice(0, MAX_MOMENTOS);

  const altura =
    ALTURA_CABECALHO +
    ALTURA_TITULO +
    linhasDeRecordes * (ALTURA_RECORDE + ESPACO) +
    (momentos.length ? ALTURA_TITULO + momentos.length * ALTURA_MOMENTO + ESPACO : 0) +
    ALTURA_RODAPE;

  const icones = await carregarIcones(
    [...recordes.map((r) => r.championName), ...momentos.map((m) => m.championName)],
    opcoes.iconeDoCampeao
  );

  const { canvas, ctx } = criarCanvas(altura);
  desenharMarca(
    ctx,
    `Destaques · de ${destaques.partidas} partida${destaques.partidas === 1 ? '' : 's'}`,
    new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  );

  let y = ALTURA_CABECALHO;
  desenharTitulo(ctx, 'RECORDES', y);
  y += ALTURA_TITULO;

  const larguraDoCartao = (LARGURA - MARGEM * 2 - ESPACO) / 2;
  recordes.forEach((recorde, i) => {
    const x = MARGEM + (i % 2) * (larguraDoCartao + ESPACO);
    const topo = y + Math.floor(i / 2) * (ALTURA_RECORDE + ESPACO);
    desenharRecorde(ctx, recorde, x, topo, larguraDoCartao, icones, opcoes);
  });
  y += linhasDeRecordes * (ALTURA_RECORDE + ESPACO);

  if (momentos.length > 0) {
    const quando =
      momentos[0].seriesName ?? new Date(momentos[0].playedAt).toLocaleDateString('pt-BR');
    desenharTitulo(ctx, `MOMENTOS · ${quando.toUpperCase()}`, y);
    y += ALTURA_TITULO;
    momentos.forEach((momento, i) => {
      desenharMomento(ctx, momento, y + i * ALTURA_MOMENTO, icones, opcoes);
    });
  }

  desenharRodape(ctx, altura, 'Todo recorde aponta para uma partida de verdade');
  return paraPng(canvas);
}

function desenharTitulo(ctx: CanvasRenderingContext2D, texto: string, topo: number) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(texto, MARGEM, topo + 22);
}

function desenharRecorde(
  ctx: CanvasRenderingContext2D,
  recorde: RecordEntry,
  x: number,
  topo: number,
  largura: number,
  icones: Map<string, HTMLImageElement | null>,
  opcoes: OpcoesDosDestaques
) {
  const meta = opcoes.categoria(recorde.categoria);
  if (!meta) return;

  ctx.fillStyle = COR.fundoAlterna;
  caixa(ctx, x, topo, largura, ALTURA_RECORDE, 10);
  ctx.fill();

  const meio = topo + ALTURA_RECORDE / 2;
  desenharIcone(
    ctx,
    icones.get(recorde.championName),
    x + 12,
    meio - ICONE_DO_RECORDE / 2,
    ICONE_DO_RECORDE
  );

  // O número é o assunto do cartão; o texto para antes dele.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = fonte(26, 700);
  // "Mais mortes" sai do ouro: virar troféu de morte confundiria o que é mérito.
  ctx.fillStyle = meta.zoeira ? COR.derrota : COR.ouro;
  ctx.fillText(recorde.exibicao, x + largura - 14, meio);
  const larguraDoNumero = ctx.measureText(recorde.exibicao).width;
  ctx.textAlign = 'left';

  const xDoTexto = x + 12 + ICONE_DO_RECORDE + 12;
  const larguraDoTexto = x + largura - 14 - larguraDoNumero - 12 - xDoTexto;
  ctx.font = fonte(11, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(cortar(ctx, meta.label.toUpperCase(), larguraDoTexto), xDoTexto, meio - 11);
  ctx.font = fonte(17, 600);
  ctx.fillStyle = COR.texto;
  ctx.fillText(cortar(ctx, recorde.playerName, larguraDoTexto), xDoTexto, meio + 10);
  ctx.textBaseline = 'alphabetic';
}

function desenharMomento(
  ctx: CanvasRenderingContext2D,
  momento: MomentEntry,
  topo: number,
  icones: Map<string, HTMLImageElement | null>,
  opcoes: OpcoesDosDestaques
) {
  const { titulo, frase, destaque } = opcoes.momento(momento);
  const meio = topo + ALTURA_MOMENTO / 2;

  desenharIcone(
    ctx,
    icones.get(momento.championName),
    MARGEM,
    meio - ICONE_DO_MOMENTO / 2,
    ICONE_DO_MOMENTO
  );

  const xDoTexto = MARGEM + ICONE_DO_MOMENTO + 12;
  const larguraDoTexto = LARGURA - MARGEM - 130 - xDoTexto;
  ctx.textBaseline = 'middle';
  ctx.font = fonte(14, 700);
  // Só quadra e penta brilham em ouro -- se tudo brilha, nada brilha.
  ctx.fillStyle = destaque ? COR.ouro : COR.aviso;
  ctx.fillText(titulo, xDoTexto, meio - 10);
  const larguraDoTitulo = ctx.measureText(`${titulo}  `).width;
  ctx.font = fonte(16, 600);
  ctx.fillStyle = COR.texto;
  ctx.fillText(
    cortar(ctx, momento.playerName, larguraDoTexto - larguraDoTitulo),
    xDoTexto + larguraDoTitulo,
    meio - 10
  );
  ctx.font = fonte(13);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(cortar(ctx, frase, larguraDoTexto), xDoTexto, meio + 11);

  ctx.textAlign = 'right';
  ctx.font = fonte(15, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(`${momento.kills}/${momento.deaths}/${momento.assists}`, LARGURA - MARGEM, meio - 9);
  ctx.font = fonte(12);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(`Jogo ${momento.matchNumber}`, LARGURA - MARGEM, meio + 11);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
