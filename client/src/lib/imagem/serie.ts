import { ROLES, type MatchStat, type SeriesDetail, type TeamSide } from '../../types';
import {
  caixa,
  carregarIcones,
  COR,
  cortar,
  criarCanvas,
  desenharIcone,
  desenharMarca,
  desenharRodape,
  duracao,
  fonte,
  LARGURA,
  MARGEM,
  paraPng,
  type ResolverIcone,
} from './canvas';
import { elencoDoTimeA, ladoDoTimeA } from '../timeDaSerie';
import { conquistasEmOrdem } from '../selos';
import { estatisticasDaSerie, selosDaMd3, type JogadorNaSerie } from '../serieStats';
import { alturaDoBlocoDeSelos, desenharSelos } from './partida';

/**
 * A MD3 inteira como imagem: o placar, um bloco por jogo e os queimados.
 *
 * O placar é por ELENCO, não por cor -- a mesma regra do servidor
 * (`computeSeriesStanding`). Os times trocam de lado entre os jogos, e uma
 * imagem que contasse azul contra vermelho transformaria um 2-0 num 1-1.
 */

type Partida = SeriesDetail['matches'][number];

export interface OpcoesDaSerie {
  iconeDoCampeao: ResolverIcone;
}

const ALTURA_CABECALHO = 112;
const ALTURA_PLACAR = 160;
const ALTURA_JOGO = 72;
const ALTURA_TITULO_QUEIMADOS = 34;
const ICONE_DO_JOGO = 32;
const ICONE_QUEIMADO = 30;
const ALTURA_RODAPE = 50;
const ALTURA_TITULO_NA_SERIE = 38;
const ALTURA_CABECA_DO_TIME = 24;
const ALTURA_LINHA_NA_SERIE = 28;
const ESPACO_ENTRE_COLUNAS = 28;
const ICONE_NA_SERIE = 22;

const ordemDaRole = (stat: MatchStat) => {
  const indice = ROLES.indexOf(stat.rolePlayed);
  return indice < 0 ? ROLES.length : indice;
};

// Moraram aqui até as stats da série precisarem delas também.
export { elencoDoTimeA, ladoDoTimeA };

export async function gerarImagemDaSerie(
  serie: SeriesDetail,
  opcoes: OpcoesDaSerie
): Promise<Blob> {
  const partidas = [...serie.matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const elencoA = elencoDoTimeA(partidas);

  const porLinha = Math.floor((LARGURA - MARGEM * 2 + 6) / (ICONE_QUEIMADO + 6));
  const linhasDeQueimados = Math.ceil(serie.burnedChampions.length / porLinha);
  const alturaDosQueimados = linhasDeQueimados
    ? ALTURA_TITULO_QUEIMADOS + linhasDeQueimados * (ICONE_QUEIMADO + 6) + 10
    : 0;
  // A MD3 por jogador (#97): o K/D/A somado de cada time e os selos da MD3 --
  // as mesmas contas do bloco "A MD3 inteira" do Histórico.
  const jogadores = estatisticasDaSerie(partidas);
  const conquistas = conquistasEmOrdem(selosDaMd3(jogadores), jogadores);
  const linhasPorTime = Math.max(
    ...(['A', 'B'] as const).map((time) => jogadores.filter((j) => j.time === time).length)
  );
  const alturaNaSerie = jogadores.length
    ? ALTURA_TITULO_NA_SERIE + ALTURA_CABECA_DO_TIME + linhasPorTime * ALTURA_LINHA_NA_SERIE + 8
    : 0;
  const altura =
    ALTURA_CABECALHO +
    ALTURA_PLACAR +
    partidas.length * ALTURA_JOGO +
    alturaNaSerie +
    alturaDoBlocoDeSelos(conquistas.length) +
    alturaDosQueimados +
    ALTURA_RODAPE;

  const icones = await carregarIcones(
    [
      ...partidas.flatMap((p) => p.stats.map((s) => s.championName)),
      ...serie.burnedChampions.map((c) => c.championName),
    ],
    opcoes.iconeDoCampeao
  );

  const { canvas, ctx } = criarCanvas(altura);

  // A data do primeiro JOGO, não a da série: `serie.date` é quando a MD3 foi
  // aberta no site, e uma noite registrada no dia seguinte sairia com a data
  // errada ao lado do nome ("Domingo 07/09" · "08 de setembro").
  const quando = partidas[0]?.playedAt ?? serie.date;
  const data = new Date(quando).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  desenharMarca(ctx, `${serie.name ?? 'MD3'}${serie.fearless ? ' · Fearless' : ''}`, data);

  const primeira = partidas[0];
  const nomesDoLado = (lado: TeamSide) =>
    (primeira?.stats ?? [])
      .filter((s) => s.teamSide === lado)
      .sort((a, b) => ordemDaRole(a) - ordemDaRole(b))
      .map((s) => s.player.name);
  desenharPlacar(ctx, serie, nomesDoLado('BLUE'), nomesDoLado('RED'));

  let y = ALTURA_CABECALHO + ALTURA_PLACAR;
  partidas.forEach((partida, indice) => {
    desenharJogo(ctx, partida, elencoA, y, icones, indice);
    y += ALTURA_JOGO;
  });

  if (jogadores.length > 0) {
    desenharNaSerie(ctx, jogadores, y, icones);
    y += alturaNaSerie;
  }
  if (conquistas.length > 0) {
    desenharSelos(ctx, conquistas, y, 'DESTAQUES DA MD3');
    y += alturaDoBlocoDeSelos(conquistas.length);
  }

  if (serie.burnedChampions.length > 0) {
    desenharQueimados(ctx, serie, y, icones, porLinha);
  }

  desenharRodape(ctx, altura, 'Placar por elenco: quem trocou de lado continua no mesmo time');
  return paraPng(canvas);
}

function desenharPlacar(
  ctx: CanvasRenderingContext2D,
  serie: SeriesDetail,
  timeA: string[],
  timeB: string[]
) {
  const topo = ALTURA_CABECALHO;
  const aVenceu = serie.blueScore > serie.redScore;
  const bVenceu = serie.redScore > serie.blueScore;
  const larguraDosNomes = 280;

  ctx.textBaseline = 'alphabetic';
  const coluna = (titulo: string, nomes: string[], venceu: boolean, direita: boolean) => {
    const x = direita ? LARGURA - MARGEM : MARGEM;
    ctx.textAlign = direita ? 'right' : 'left';
    ctx.font = fonte(13, 700);
    ctx.fillStyle = venceu ? COR.ouro : COR.fraco;
    // O troféu vai do lado de dentro, virado para o placar -- e só com a MD3
    // encerrada: quem está 1-0 no meio da noite ainda não levou nada.
    const campeao = venceu && serie.status === 'FINISHED';
    const comTrofeu = campeao ? (direita ? `🏆 ${titulo}` : `${titulo} 🏆`) : titulo;
    ctx.fillText(comTrofeu, x, topo + 26);
    ctx.font = fonte(15);
    ctx.fillStyle = COR.texto;
    nomes.forEach((nome, i) => {
      ctx.fillText(cortar(ctx, nome, larguraDosNomes), x, topo + 52 + i * 21);
    });
  };
  coluna('TIME A', timeA, aVenceu, false);
  coluna('TIME B', timeB, bVenceu, true);

  // O placar no meio, grande: é o que se lê primeiro, mesmo em miniatura.
  ctx.textAlign = 'center';
  ctx.font = fonte(56, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${serie.blueScore} – ${serie.redScore}`, LARGURA / 2, topo + 88);
  ctx.font = fonte(13);
  ctx.fillStyle = COR.fraco;
  const estado =
    serie.status === 'FINISHED'
      ? aVenceu
        ? 'time A levou a MD3'
        : bVenceu
          ? 'time B levou a MD3'
          : 'MD3 encerrada'
      : 'MD3 em andamento';
  ctx.fillText(estado, LARGURA / 2, topo + 114);
  ctx.textAlign = 'left';

  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEM, topo + ALTURA_PLACAR - 12);
  ctx.lineTo(LARGURA - MARGEM, topo + ALTURA_PLACAR - 12);
  ctx.stroke();
}

function desenharJogo(
  ctx: CanvasRenderingContext2D,
  partida: Partida,
  elencoA: ReadonlySet<string>,
  topo: number,
  icones: Map<string, HTMLImageElement | null>,
  indice: number
) {
  if (indice % 2 === 0) {
    ctx.fillStyle = COR.fundoAlterna;
    caixa(ctx, MARGEM - 10, topo + 4, LARGURA - MARGEM * 2 + 20, ALTURA_JOGO - 8, 8);
    ctx.fill();
  }

  const meio = topo + ALTURA_JOGO / 2;
  const ladoA = ladoDoTimeA(partida.stats, elencoA);
  const venceuA = partida.winner ? partida.winner === ladoA : null;
  const campeoes = (doA: boolean) =>
    partida.stats
      .filter((s) => (s.teamSide === ladoA) === doA)
      .sort((a, b) => ordemDaRole(a) - ordemDaRole(b));

  ctx.textBaseline = 'middle';
  ctx.font = fonte(14, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`JOGO ${partida.matchNumber}`, MARGEM, meio - 9);
  ctx.font = fonte(12);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(duracao(partida.gameDurationSec) ?? '', MARGEM, meio + 11);

  const larguraDoTime = 5 * ICONE_DO_JOGO + 4 * 4;
  const xDoTimeA = MARGEM + 96;
  const xDoTimeB = LARGURA - MARGEM - larguraDoTime;
  const desenharCampeoes = (lista: MatchStat[], x0: number, venceu: boolean, lado: TeamSide) => {
    // O lado em que o time jogou NESTE jogo: na MD3 os times trocam de lado,
    // então o time A pode ser azul no jogo 1 e vermelho no jogo 2.
    ctx.fillStyle = lado === 'BLUE' ? COR.azul : COR.vermelho;
    ctx.fillRect(x0 - 9, meio - ICONE_DO_JOGO / 2, 3, ICONE_DO_JOGO);
    lista.forEach((stat, i) => {
      desenharIcone(
        ctx,
        icones.get(stat.championName),
        x0 + i * (ICONE_DO_JOGO + 4),
        meio - ICONE_DO_JOGO / 2,
        ICONE_DO_JOGO
      );
    });
    // Traço verde sob o time que venceu: marca o resultado sem texto.
    if (venceu) {
      ctx.fillStyle = COR.vitoria;
      ctx.fillRect(x0, meio + ICONE_DO_JOGO / 2 + 4, larguraDoTime, 3);
    }
  };
  desenharCampeoes(campeoes(true), xDoTimeA, venceuA === true, ladoA);
  desenharCampeoes(campeoes(false), xDoTimeB, venceuA === false, ladoA === 'BLUE' ? 'RED' : 'BLUE');

  ctx.textAlign = 'center';
  ctx.font = fonte(15, 700);
  ctx.fillStyle = venceuA === null ? COR.fraco : COR.vitoria;
  const resultado = venceuA === null ? 'sem resultado' : venceuA ? '◀ time A' : 'time B ▶';
  const centro = (xDoTimeA + larguraDoTime + xDoTimeB) / 2;
  ctx.fillText(resultado, centro, meio);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * K/D/A somado da MD3, um time por coluna. Quem não jogou todos os jogos sai
 * mais apagado: os números dele são de menos partidas.
 */
function desenharNaSerie(
  ctx: CanvasRenderingContext2D,
  jogadores: JogadorNaSerie[],
  topo: number,
  icones: Map<string, HTMLImageElement | null>
) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('NA SÉRIE · SOMA DOS JOGOS', MARGEM, topo + 22);

  // Dano zerado em todo mundo é importação antiga sem a coluna: a coluna some,
  // em vez de uma fileira de "0k" que parece dado.
  const temDano = jogadores.some((jogador) => jogador.damage > 0);
  const largura = (LARGURA - MARGEM * 2 - ESPACO_ENTRE_COLUNAS) / 2;
  (['A', 'B'] as const).forEach((time, coluna) => {
    const x = MARGEM + coluna * (largura + ESPACO_ENTRE_COLUNAS);
    const fimDoKda = temDano ? x + largura - 58 : x + largura;
    const cabeca = topo + ALTURA_TITULO_NA_SERIE;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = fonte(12, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(`TIME ${time}`, x, cabeca + ALTURA_CABECA_DO_TIME / 2);
    ctx.textAlign = 'right';
    ctx.font = fonte(11);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(
      temDano ? 'K/D/A · DANO' : 'K/D/A',
      x + largura,
      cabeca + ALTURA_CABECA_DO_TIME / 2
    );

    jogadores
      .filter((jogador) => jogador.time === time)
      .forEach((jogador, i) => {
        const meio =
          cabeca + ALTURA_CABECA_DO_TIME + i * ALTURA_LINHA_NA_SERIE + ALTURA_LINHA_NA_SERIE / 2;

        // Os campeões da MD3, na ordem dos jogos, no vão entre o nome e o
        // K/D/A: é o que o grupo usa para lembrar quem jogou de quê.
        const fimDosIcones = fimDoKda - 72;
        const inicioDosIcones = fimDosIcones - jogador.campeoes.length * (ICONE_NA_SERIE + 4) + 4;
        jogador.campeoes.forEach((campeao, k) => {
          desenharIcone(
            ctx,
            icones.get(campeao),
            inicioDosIcones + k * (ICONE_NA_SERIE + 4),
            meio - ICONE_NA_SERIE / 2,
            ICONE_NA_SERIE
          );
        });

        ctx.textAlign = 'left';
        ctx.font = fonte(14, 600);
        ctx.fillStyle = jogador.completo ? COR.texto : COR.fraco;
        ctx.fillText(cortar(ctx, jogador.player.name, inicioDosIcones - x - 12), x, meio);
        ctx.textAlign = 'right';
        ctx.font = fonte(14, 700);
        ctx.fillStyle = COR.texto;
        ctx.fillText(`${jogador.kills}/${jogador.deaths}/${jogador.assists}`, fimDoKda, meio);
        if (!temDano) return;
        ctx.font = fonte(12);
        ctx.fillStyle = COR.fraco;
        const dano = jogador.damage > 0 ? `${Math.round(jogador.damage / 1000)}k` : '--';
        ctx.fillText(dano, x + largura, meio);
      });
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function desenharQueimados(
  ctx: CanvasRenderingContext2D,
  serie: SeriesDetail,
  topo: number,
  icones: Map<string, HTMLImageElement | null>,
  porLinha: number
) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText(`QUEIMADOS NO FEARLESS (${serie.burnedChampions.length})`, MARGEM, topo + 22);

  serie.burnedChampions.forEach((campeao, i) => {
    const linha = Math.floor(i / porLinha);
    const coluna = i % porLinha;
    desenharIcone(
      ctx,
      icones.get(campeao.championName),
      MARGEM + coluna * (ICONE_QUEIMADO + 6),
      topo + ALTURA_TITULO_QUEIMADOS + linha * (ICONE_QUEIMADO + 6),
      ICONE_QUEIMADO
    );
  });
}
