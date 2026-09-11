import type { MomentEntry, MomentType } from '../../types';
import {
  caixa,
  carregarIcones,
  COR,
  comAlfa,
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
 * Os momentos de UMA noite como imagem, separados por jogo.
 *
 * É a imagem do fim da noite: "JOGO 1" com o que rolou nele, "JOGO 2" com o
 * que rolou nele. Separar por jogo responde a pergunta que o grupo faz ("em
 * que jogo foi a quadra?") sem precisar de legenda em cada linha.
 *
 * O cartão de um momento também é usado pela imagem dos Destaques, para os
 * dois nunca terem cara diferente.
 */

/** O texto do momento vem da tela (HighlightsPage), para imagem e tela dizerem o mesmo. */
export interface TextoDoMomento {
  titulo: string;
  frase: string;
  /** Penta e quadra: o único caso com anel dourado. */
  destaque: boolean;
}

export interface OpcoesDosMomentos {
  iconeDoCampeao: ResolverIcone;
  momento: (momento: MomentEntry) => TextoDoMomento;
}

const ALTURA_CABECALHO = 112;
const ALTURA_DO_JOGO = 46;
/** Altura de um cartão de momento, sem o espaço até o próximo. */
export const ALTURA_CARTAO_MOMENTO = 66;
export const ESPACO_ENTRE_MOMENTOS = 8;
const ESPACO_ENTRE_JOGOS = 16;
const ALTURA_RODAPE = 56;
const ICONE = 46;
/** Por jogo. Uma partida doida pode ter uma dúzia; a imagem não pode virar rolagem. */
const MAX_POR_JOGO = 8;

/**
 * Cor da etiqueta de cada tipo -- a mesma de `MOMENTO[tipo].classe` na tela:
 * ouro para penta e quadra, verde para quem não morreu, vermelho para quem
 * carregou, azul para a muralha, e o resto apagado.
 */
const COR_DO_TIPO: Record<MomentType, string> = {
  PENTA: COR.ouro,
  QUADRA: COR.ouro,
  SPREE: COR.aviso,
  SEM_MORRER: COR.vitoria,
  CARRY: COR.vermelho,
  MURALHA: COR.azul,
  VISAO: COR.apagado,
  FARM: COR.apagado,
  FIRST_BLOOD: COR.apagado,
};

/** Os momentos da noite mais recente. A lista chega do mais novo para o mais velho. */
export function momentosDaUltimaNoite(momentos: readonly MomentEntry[]): MomentEntry[] {
  const noite = momentos[0]?.seriesId;
  return noite ? momentos.filter((momento) => momento.seriesId === noite) : [];
}

/** Agrupa por jogo, na ordem em que foram jogados; dentro do jogo, mantém a ordem que veio. */
export function porJogo(
  momentos: readonly MomentEntry[]
): { jogo: number; momentos: MomentEntry[] }[] {
  const grupos = new Map<number, MomentEntry[]>();
  for (const momento of momentos) {
    grupos.set(momento.matchNumber, [...(grupos.get(momento.matchNumber) ?? []), momento]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([jogo, lista]) => ({ jogo, momentos: lista }));
}

export async function gerarImagemDosMomentos(
  momentos: readonly MomentEntry[],
  opcoes: OpcoesDosMomentos
): Promise<Blob> {
  const jogos = porJogo(momentos).map((grupo) => ({
    ...grupo,
    momentos: grupo.momentos.slice(0, MAX_POR_JOGO),
  }));
  const altura =
    ALTURA_CABECALHO +
    jogos.reduce(
      (soma, grupo) =>
        soma +
        ALTURA_DO_JOGO +
        grupo.momentos.length * (ALTURA_CARTAO_MOMENTO + ESPACO_ENTRE_MOMENTOS) +
        ESPACO_ENTRE_JOGOS,
      0
    ) +
    ALTURA_RODAPE;

  const icones = await carregarIcones(
    momentos.map((momento) => momento.championName),
    opcoes.iconeDoCampeao
  );

  const { canvas, ctx } = criarCanvas(altura);
  const primeiro = momentos[0];
  const noite =
    primeiro?.seriesName ??
    (primeiro ? new Date(primeiro.playedAt).toLocaleDateString('pt-BR') : 'Noite');
  const data = primeiro
    ? new Date(primeiro.playedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';
  desenharMarca(ctx, `Momentos · ${noite}`, data);

  let y = ALTURA_CABECALHO;
  for (const grupo of jogos) {
    desenharCabecalhoDoJogo(ctx, grupo.jogo, grupo.momentos.length, y);
    y += ALTURA_DO_JOGO;
    for (const momento of grupo.momentos) {
      desenharCartaoDeMomento(ctx, {
        momento,
        texto: opcoes.momento(momento),
        icone: icones.get(momento.championName),
        x: MARGEM,
        topo: y,
        largura: LARGURA - MARGEM * 2,
        mostrarJogo: false,
      });
      y += ALTURA_CARTAO_MOMENTO + ESPACO_ENTRE_MOMENTOS;
    }
    y += ESPACO_ENTRE_JOGOS;
  }

  const total = momentos.length;
  desenharRodape(ctx, altura, `${total} momento${total === 1 ? '' : 's'} na noite`);
  return paraPng(canvas);
}

/** "JOGO 1" grande, um fio dourado até a borda e quantos momentos o jogo teve. */
function desenharCabecalhoDoJogo(
  ctx: CanvasRenderingContext2D,
  jogo: number,
  quantos: number,
  topo: number
) {
  const meio = topo + ALTURA_DO_JOGO / 2;
  ctx.textBaseline = 'middle';
  ctx.font = fonte(18, 700);
  ctx.fillStyle = COR.texto;
  const rotulo = `JOGO ${jogo}`;
  ctx.fillText(rotulo, MARGEM, meio);
  const fimDoRotulo = MARGEM + ctx.measureText(rotulo).width + 14;

  ctx.textAlign = 'right';
  ctx.font = fonte(13);
  ctx.fillStyle = COR.fraco;
  const contagem = `${quantos} momento${quantos === 1 ? '' : 's'}`;
  ctx.fillText(contagem, LARGURA - MARGEM, meio);
  const inicioDaContagem = LARGURA - MARGEM - ctx.measureText(contagem).width - 14;
  ctx.textAlign = 'left';

  ctx.strokeStyle = comAlfa(COR.ouro, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fimDoRotulo, meio);
  ctx.lineTo(inicioDaContagem, meio);
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
}

/**
 * Um momento em cartão: ícone do campeão, etiqueta colorida do tipo, quem fez
 * e a frase; à direita o K/D/A e, quando a imagem não separa por jogo, em que
 * jogo foi.
 */
export function desenharCartaoDeMomento(
  ctx: CanvasRenderingContext2D,
  {
    momento,
    texto,
    icone,
    x,
    topo,
    largura,
    mostrarJogo,
  }: {
    momento: MomentEntry;
    texto: TextoDoMomento;
    icone: HTMLImageElement | null | undefined;
    x: number;
    topo: number;
    largura: number;
    mostrarJogo: boolean;
  }
) {
  const cor = COR_DO_TIPO[momento.tipo] ?? COR.apagado;

  ctx.fillStyle = COR.fundoAlterna;
  caixa(ctx, x, topo, largura, ALTURA_CARTAO_MOMENTO, 12);
  ctx.fill();
  if (texto.destaque) {
    // Só penta e quadra ganham anel -- se tudo brilha, nada brilha.
    ctx.strokeStyle = comAlfa(COR.ouro, 0.7);
    ctx.lineWidth = 1.5;
    caixa(ctx, x + 0.75, topo + 0.75, largura - 1.5, ALTURA_CARTAO_MOMENTO - 1.5, 12);
    ctx.stroke();
  }

  const meio = topo + ALTURA_CARTAO_MOMENTO / 2;
  desenharIcone(ctx, icone, x + 12, meio - ICONE / 2, ICONE);

  // Direita: K/D/A e o complemento (jogo ou campeão). Mede antes para o texto
  // da esquerda saber onde parar.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const kda = `${momento.kills}/${momento.deaths}/${momento.assists}`;
  ctx.font = fonte(17, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(kda, x + largura - 16, meio - 10);
  const larguraDoKda = ctx.measureText(kda).width;
  ctx.font = fonte(12);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(
    mostrarJogo ? `Jogo ${momento.matchNumber}` : momento.championName,
    x + largura - 16,
    meio + 12
  );
  ctx.textAlign = 'left';

  const xDoTexto = x + 12 + ICONE + 14;
  const limite = x + largura - 16 - Math.max(larguraDoKda, 90) - 16;

  // Etiqueta do tipo: texto na cor do tipo sobre a mesma cor bem translúcida,
  // como o selo da tela.
  ctx.font = fonte(12, 700);
  const larguraDaEtiqueta = ctx.measureText(texto.titulo).width + 14;
  ctx.fillStyle = comAlfa(cor, 0.16);
  caixa(ctx, xDoTexto, meio - 21, larguraDaEtiqueta, 20, 5);
  ctx.fill();
  ctx.fillStyle = cor;
  ctx.fillText(texto.titulo, xDoTexto + 7, meio - 11);

  const xDoNome = xDoTexto + larguraDaEtiqueta + 10;
  ctx.font = fonte(17, 600);
  ctx.fillStyle = COR.texto;
  ctx.fillText(cortar(ctx, momento.playerName, limite - xDoNome), xDoNome, meio - 11);

  ctx.font = fonte(13);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(cortar(ctx, texto.frase, limite - xDoTexto), xDoTexto, meio + 13);
  ctx.textBaseline = 'alphabetic';
}
