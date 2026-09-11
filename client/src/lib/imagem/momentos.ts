import type { MomentEntry, MomentType, TeamSide } from '../../types';
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
 * Os momentos de UMA noite como imagem, separados por jogo e, dentro do jogo,
 * por lado.
 *
 * É a imagem do fim da noite: "JOGO 1", e nele o TIME AZUL e o TIME
 * VERMELHO, cada um com vitória ou derrota e o que rolou. Separar por jogo
 * responde "em que jogo foi a quadra?"; separar por lado responde "de que
 * time?" -- que na MD3 muda de um jogo para o outro, porque os times trocam
 * de lado.
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
  /** Imagem de um jogo só: entra no título ("Momentos · Quinta 10/09 · Jogo 2"). */
  jogo?: number;
}

const ALTURA_CABECALHO = 112;
const ALTURA_DO_JOGO = 46;
const ALTURA_DO_LADO = 30;
/** Altura de um cartão de momento, sem o espaço até o próximo. */
export const ALTURA_CARTAO_MOMENTO = 66;
export const ESPACO_ENTRE_MOMENTOS = 8;
const ESPACO_ENTRE_JOGOS = 16;
const ALTURA_RODAPE = 56;
const ICONE = 46;
/** Por jogo. Uma partida doida pode ter uma dúzia; a imagem não pode virar rolagem. */
const MAX_POR_JOGO = 8;

export const COR_DO_LADO: Record<TeamSide, string> = { BLUE: COR.azul, RED: COR.vermelho };
const NOME_DO_LADO: Record<TeamSide, string> = { BLUE: 'TIME AZUL', RED: 'TIME VERMELHO' };

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
  return noite ? momentosDaNoite(momentos, noite) : [];
}

/** Os momentos de uma noite qualquer (uma série). */
export function momentosDaNoite(momentos: readonly MomentEntry[], seriesId: string): MomentEntry[] {
  return momentos.filter((momento) => momento.seriesId === seriesId);
}

export interface NoiteComMomentos {
  seriesId: string;
  nome: string;
  /** Jogos da noite que tiveram momento, em ordem. */
  jogos: number[];
}

/**
 * Todas as noites que têm momento, da mais recente para a mais antiga, com
 * os jogos de cada uma. É o que o seletor dos Destaques lista: qualquer noite,
 * não só a última.
 */
export function noitesComMomentos(momentos: readonly MomentEntry[]): NoiteComMomentos[] {
  const noites = new Map<string, NoiteComMomentos>();
  for (const momento of momentos) {
    const noite = noites.get(momento.seriesId) ?? {
      seriesId: momento.seriesId,
      nome: momento.seriesName ?? new Date(momento.playedAt).toLocaleDateString('pt-BR'),
      jogos: [],
    };
    if (!noite.jogos.includes(momento.matchNumber)) noite.jogos.push(momento.matchNumber);
    noites.set(momento.seriesId, noite);
  }
  return [...noites.values()].map((noite) => ({
    ...noite,
    jogos: [...noite.jogos].sort((a, b) => a - b),
  }));
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

/**
 * Os momentos de UM jogo por lado: azul primeiro, como no Histórico. Lado sem
 * momento não aparece -- um "TIME VERMELHO" vazio seria só espaço.
 */
export function porLado(
  momentos: readonly MomentEntry[]
): { lado: TeamSide; venceu: boolean; momentos: MomentEntry[] }[] {
  return (['BLUE', 'RED'] as const)
    .map((lado) => {
      const lista = momentos.filter((momento) => momento.teamSide === lado);
      return { lado, venceu: lista[0]?.win ?? false, momentos: lista };
    })
    .filter((grupo) => grupo.momentos.length > 0);
}

export async function gerarImagemDosMomentos(
  momentos: readonly MomentEntry[],
  opcoes: OpcoesDosMomentos
): Promise<Blob> {
  const jogos = porJogo(momentos).map((grupo) => ({
    jogo: grupo.jogo,
    lados: porLado(grupo.momentos.slice(0, MAX_POR_JOGO)),
  }));
  const passo = ALTURA_CARTAO_MOMENTO + ESPACO_ENTRE_MOMENTOS;
  const altura =
    ALTURA_CABECALHO +
    jogos.reduce(
      (soma, grupo) =>
        soma +
        ALTURA_DO_JOGO +
        grupo.lados.reduce((s, lado) => s + ALTURA_DO_LADO + lado.momentos.length * passo, 0) +
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
  desenharMarca(ctx, `Momentos · ${noite}${opcoes.jogo ? ` · Jogo ${opcoes.jogo}` : ''}`, data);

  let y = ALTURA_CABECALHO;
  for (const grupo of jogos) {
    const quantos = grupo.lados.reduce((soma, lado) => soma + lado.momentos.length, 0);
    desenharCabecalhoDoJogo(ctx, grupo.jogo, quantos, y);
    y += ALTURA_DO_JOGO;
    for (const lado of grupo.lados) {
      desenharCabecalhoDoLado(ctx, lado.lado, lado.venceu, y);
      y += ALTURA_DO_LADO;
      for (const momento of lado.momentos) {
        desenharCartaoDeMomento(ctx, {
          momento,
          texto: opcoes.momento(momento),
          icone: icones.get(momento.championName),
          x: MARGEM,
          topo: y,
          largura: LARGURA - MARGEM * 2,
          mostrarJogo: false,
        });
        y += passo;
      }
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

/** "TIME AZUL  VITÓRIA": o lado na cor dele e o resultado na cor do resultado. */
function desenharCabecalhoDoLado(
  ctx: CanvasRenderingContext2D,
  lado: TeamSide,
  venceu: boolean,
  topo: number
) {
  const meio = topo + ALTURA_DO_LADO / 2 - 2;
  ctx.textBaseline = 'middle';
  ctx.font = fonte(13, 700);
  ctx.fillStyle = COR_DO_LADO[lado];
  ctx.fillText(NOME_DO_LADO[lado], MARGEM + 2, meio);
  const larguraDoNome = ctx.measureText(`${NOME_DO_LADO[lado]}   `).width;
  ctx.fillStyle = venceu ? COR.vitoria : COR.derrota;
  ctx.fillText(venceu ? 'VITÓRIA' : 'DERROTA', MARGEM + 2 + larguraDoNome, meio);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Um momento em cartão: faixa na cor do lado, ícone do campeão, etiqueta
 * colorida do tipo, quem fez e a frase; à direita o K/D/A e, quando a imagem
 * não separa por jogo, em que jogo foi.
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
  // A faixa do lado, como nos blocos de time da imagem do jogo.
  ctx.fillStyle = COR_DO_LADO[momento.teamSide] ?? COR.linha;
  caixa(ctx, x, topo, 4, ALTURA_CARTAO_MOMENTO, 2);
  ctx.fill();
  if (texto.destaque) {
    // Só penta e quadra ganham anel -- se tudo brilha, nada brilha.
    ctx.strokeStyle = comAlfa(COR.ouro, 0.7);
    ctx.lineWidth = 1.5;
    caixa(ctx, x + 0.75, topo + 0.75, largura - 1.5, ALTURA_CARTAO_MOMENTO - 1.5, 12);
    ctx.stroke();
  }

  const meio = topo + ALTURA_CARTAO_MOMENTO / 2;
  desenharIcone(ctx, icone, x + 14, meio - ICONE / 2, ICONE);

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

  const xDoTexto = x + 14 + ICONE + 14;
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
