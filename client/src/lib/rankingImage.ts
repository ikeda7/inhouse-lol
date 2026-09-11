import { hexDeCorDoNome, iniciaisDoNome } from './avatar';
import type { LeaderboardEntry } from '../types';
import {
  caixa,
  carregarIcone,
  COR,
  cortar,
  criarCanvas,
  desenharMarca,
  desenharRodape,
  fonte,
  LARGURA,
  MARGEM,
  paraPng,
  type ResolverIcone,
} from './imagem/canvas';

// A entrega (copiar, baixar, enviar) é a mesma para toda imagem e mora em
// lib/imagem/canvas.ts; fica reexportada aqui para quem já importava daqui.
export {
  baixarImagem,
  compartilharImagem,
  copiarImagem,
  ehTelaDeToque,
  podeCopiarImagem,
} from './imagem/canvas';

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
 * As peças comuns a toda imagem exportada (cores, fonte, ícone, marca, rodapé)
 * ficam em lib/imagem/canvas.ts.
 */

const ALTURA_LINHA = 62;
const ALTURA_CABECALHO = 130;
const ALTURA_RODAPE = 56;

/** Quantos entram na imagem. Além disso a imagem fica alta demais para o zap. */
const MAX_LINHAS = 15;

/** Largura reservada à direita para V–D, WR, KDA e PTS. */
const RESERVA_DAS_COLUNAS = 360;

function medalha(posicao: number): string {
  return medalhaOuNada(posicao) ?? COR.fraco;
}

/**
 * A mesma escala, mas devolvendo null fora do pódio.
 *
 * O número da posição sempre tem cor, então `medalha` cai no cinza. O anel em
 * volta da foto não: fora dos três primeiros ele simplesmente não existe, e um
 * anel cinza em todo mundo mataria o sinal que o pódio deveria dar.
 */
function medalhaOuNada(posicao: number): string | null {
  if (posicao === 0) return COR.ouro;
  if (posicao === 1) return COR.prata;
  if (posicao === 2) return COR.bronze;
  return null;
}

export interface OpcoesDaImagem {
  /** Resolve o nome do campeão para a URL do ícone. Null = sem ícone. */
  iconeDoCampeao: ResolverIcone;
  /** Rótulo do critério de ordenação, para a imagem dizer como foi ordenada. */
  ordenadoPor: string;
}

export async function gerarImagemDoRanking(
  entries: LeaderboardEntry[],
  opcoes: OpcoesDaImagem
): Promise<Blob> {
  const linhas = entries.slice(0, MAX_LINHAS);
  const altura = ALTURA_CABECALHO + linhas.length * ALTURA_LINHA + ALTURA_RODAPE;

  // Os ícones vêm todos de uma vez: em série, 45 requisições sequenciais
  // deixariam o botão travado por segundos.
  const icones = new Map<string, HTMLImageElement | null>();
  // Foto de perfil de quem tem conta. Entra no MESMO `Promise.all` dos ícones
  // em vez de num segundo await: são requisições independentes, e enfileirar as
  // duas levas dobraria a espera do botão à toa.
  const fotos = new Map<string, HTMLImageElement | null>();
  await Promise.all([
    ...[...new Set(linhas.flatMap((e) => e.topChampions.map((c) => c.championName)))].map(
      async (nome) => {
        const url = opcoes.iconeDoCampeao(nome);
        icones.set(nome, url ? await carregarIcone(url) : null);
      }
    ),
    ...linhas
      .filter((e) => e.photoUrl)
      .map(async (e) => {
        fotos.set(e.playerId, await carregarIcone(e.photoUrl as string));
      }),
  ]);

  const { canvas, ctx } = criarCanvas(altura);

  desenharCabecalho(ctx, opcoes.ordenadoPor);

  linhas.forEach((entry, index) => {
    desenharLinha(ctx, entry, index, icones, fotos);
  });

  desenharRodape(ctx, altura, '+3 por mapa vencido · +1 por MD3');
  if (entries.length > MAX_LINHAS) {
    ctx.font = fonte(13);
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.fraco;
    ctx.fillText(`e mais ${entries.length - MAX_LINHAS} jogador(es)`, LARGURA / 2, altura - 22);
    ctx.textAlign = 'left';
  }

  return paraPng(canvas);
}

function desenharCabecalho(ctx: CanvasRenderingContext2D, ordenadoPor: string) {
  desenharMarca(
    ctx,
    `Classificação geral · por ${ordenadoPor.toLowerCase()}`,
    new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  );

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

/** Diâmetro do avatar na linha. */
const TAMANHO_AVATAR = 34;

/**
 * O avatar do jogador, redondo, com anel de pódio nos três primeiros.
 *
 * Espelha o que a tela faz -- e é por isso que as iniciais e a cor saem de
 * `lib/avatar.ts` em vez de serem recalculadas aqui: se a imagem inventasse a
 * própria paleta, a mesma pessoa apareceria de uma cor no site e de outra no
 * zap, e nada acusaria.
 *
 * Sem foto NÃO vira buraco: o círculo de iniciais entra no lugar. Um vazio na
 * coluna leria como erro de carregamento, e boa parte do grupo ainda não criou
 * conta.
 */
function desenharAvatar(
  ctx: CanvasRenderingContext2D,
  entry: LeaderboardEntry,
  foto: HTMLImageElement | null | undefined,
  cx: number,
  cy: number,
  index: number
) {
  const raio = TAMANHO_AVATAR / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.clip();

  if (foto) {
    // `drawImage` estica para o quadrado dado; com foto não-quadrada isso
    // deformaria o rosto. Recorta o centro do lado menor antes.
    const lado = Math.min(foto.naturalWidth, foto.naturalHeight);
    ctx.drawImage(
      foto,
      (foto.naturalWidth - lado) / 2,
      (foto.naturalHeight - lado) / 2,
      lado,
      lado,
      cx - raio,
      cy - raio,
      TAMANHO_AVATAR,
      TAMANHO_AVATAR
    );
  } else {
    ctx.fillStyle = hexDeCorDoNome(entry.name);
    ctx.fillRect(cx - raio, cy - raio, TAMANHO_AVATAR, TAMANHO_AVATAR);
    ctx.fillStyle = COR.texto;
    ctx.font = fonte(13, 600);
    ctx.textAlign = 'center';
    ctx.fillText(iniciaisDoNome(entry.name), cx, cy + 1);
  }
  ctx.restore();

  // O anel fica FORA do clip, senão metade da espessura some sob a borda do
  // círculo e o ouro do primeiro lugar vira um fio.
  const corDoAnel = medalhaOuNada(index);
  if (corDoAnel) {
    ctx.beginPath();
    ctx.arc(cx, cy, raio + 2, 0, Math.PI * 2);
    ctx.strokeStyle = corDoAnel;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.textAlign = 'left';
}

function desenharLinha(
  ctx: CanvasRenderingContext2D,
  entry: LeaderboardEntry,
  index: number,
  icones: Map<string, HTMLImageElement | null>,
  fotos: Map<string, HTMLImageElement | null>
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

  // A foto vem logo depois do número, como na tela: primeiro QUEM, depois o que
  // a pessoa jogou.
  const X_AVATAR = MARGEM + 38;
  desenharAvatar(ctx, entry, fotos.get(entry.playerId), X_AVATAR + TAMANHO_AVATAR / 2, meio, index);

  // +4 de folga para o anel do pódio, que passa 2px do raio.
  let x = X_AVATAR + TAMANHO_AVATAR + 12;
  const inicioDosCampeoes = x;
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
  // Três posições de campeão SEMPRE, mesmo com menos de três: assim o nome
  // começa na mesma coluna em toda linha.
  const xDoNome = inicioDosCampeoes + 3 * (TAMANHO_ICONE + 5) + 8;
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
