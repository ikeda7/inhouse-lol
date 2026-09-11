import {
  ROLES,
  ROLE_LABEL,
  type MatchStat,
  type MatchTeamStat,
  type SeriesDetail,
  type TeamSide,
} from '../../types';
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
  milhar,
  paraPng,
  type ResolverIcone,
} from './canvas';
import { conquistasEmOrdem, selosDaPartida, type Conquista, type SeloConquistado } from '../selos';

/**
 * Uma partida como imagem, para mandar no grupo logo depois do jogo.
 *
 * Os dois times empilhados, não lado a lado: no telefone, duas colunas de
 * scoreboard viram letra miúda. Empilhado, cada linha tem a largura inteira
 * para nome, K/D/A, dano, ouro e farm -- o que o grupo discute no fim do jogo.
 */

type Partida = SeriesDetail['matches'][number];

export interface OpcoesDaPartida {
  nomeDaSerie: string | null;
  iconeDoCampeao: ResolverIcone;
}

const ALTURA_CABECALHO = 112;
const ALTURA_COLUNAS = 30;
const ALTURA_TIME = 44;
const ALTURA_LINHA = 54;
const ESPACO_ENTRE_TIMES = 14;
const ALTURA_BANS = 74;
const ALTURA_RODAPE = 50;
const ICONE = 38;
const ICONE_DO_BAN = 32;
const ALTURA_TITULO_SELOS = 34;
const ALTURA_SELO = 56;
const ESPACO_SELO = 10;

// Colunas numéricas, alinhadas à direita: o x é onde a coluna TERMINA.
const COL_KDA = LARGURA - MARGEM - 300;
const COL_DANO = LARGURA - MARGEM - 190;
const COL_OURO = LARGURA - MARGEM - 90;
const COL_CS = LARGURA - MARGEM;

const NOME_DO_LADO: Record<TeamSide, string> = { BLUE: 'TIME AZUL', RED: 'TIME VERMELHO' };
const COR_DO_LADO: Record<TeamSide, string> = { BLUE: COR.azul, RED: COR.vermelho };

const ORIGEM: Record<Partida['source'], string> = {
  LCU: 'importada do cliente do LoL',
  ROFL: 'importada do replay',
  RIOT_API: 'importada da Riot',
  MANUAL: 'registrada à mão',
};

interface Time {
  lado: TeamSide;
  jogadores: MatchStat[];
  objetivos: MatchTeamStat | null;
  bans: Partida['bans'];
}

const ordemDaRole = (stat: MatchStat) => {
  const indice = ROLES.indexOf(stat.rolePlayed);
  return indice < 0 ? ROLES.length : indice;
};

export async function gerarImagemDaPartida(
  partida: Partida,
  opcoes: OpcoesDaPartida
): Promise<Blob> {
  const times: Time[] = (['BLUE', 'RED'] as const).map((lado) => ({
    lado,
    jogadores: partida.stats
      .filter((s) => s.teamSide === lado)
      .sort((a, b) => ordemDaRole(a) - ordemDaRole(b)),
    objetivos: partida.teams.find((t) => t.teamSide === lado) ?? null,
    bans: partida.bans.filter((b) => b.teamSide === lado).sort((a, b) => a.pickTurn - b.pickTurn),
  }));

  const temBans = partida.bans.length > 0;
  // Os mesmos selos do Histórico (lib/selos.ts): a imagem nunca discorda da tela.
  const selos = selosDaPartida(partida.stats);
  const conquistas = conquistasEmOrdem(selos, partida.stats);
  const alturaDosSelos = conquistas.length
    ? ALTURA_TITULO_SELOS + Math.ceil(conquistas.length / 2) * (ALTURA_SELO + ESPACO_SELO)
    : 0;
  const altura =
    ALTURA_CABECALHO +
    ALTURA_COLUNAS +
    times.reduce(
      (soma, t) => soma + ALTURA_TIME + t.jogadores.length * ALTURA_LINHA + ESPACO_ENTRE_TIMES,
      0
    ) +
    (temBans ? ALTURA_BANS : 0) +
    alturaDosSelos +
    ALTURA_RODAPE;

  const icones = await carregarIcones(
    [...partida.stats.map((s) => s.championName), ...partida.bans.map((b) => b.championName ?? '')],
    opcoes.iconeDoCampeao
  );

  const { canvas, ctx } = criarCanvas(altura);

  const detalhes = [
    duracao(partida.gameDurationSec),
    partida.gameVersion ? `patch ${partida.gameVersion.split('.').slice(0, 2).join('.')}` : null,
    partida.surrendered ? 'rendição' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  desenharMarca(ctx, `${opcoes.nomeDaSerie ?? 'Partida'} · Jogo ${partida.matchNumber}`, detalhes);

  desenharColunas(ctx, ALTURA_CABECALHO + ALTURA_COLUNAS - 10);

  let y = ALTURA_CABECALHO + ALTURA_COLUNAS;
  for (const time of times) {
    y = desenharTime(ctx, time, partida.winner, y, icones, selos) + ESPACO_ENTRE_TIMES;
  }
  if (temBans) {
    desenharBans(ctx, times, y, icones);
    y += ALTURA_BANS;
  }
  if (conquistas.length > 0) desenharSelos(ctx, conquistas, y);

  desenharRodape(ctx, altura, ORIGEM[partida.source]);
  return paraPng(canvas);
}

function desenharColunas(ctx: CanvasRenderingContext2D, y: number) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('JOGADOR', MARGEM + 4, y);
  ctx.textAlign = 'right';
  ctx.fillText('K/D/A', COL_KDA, y);
  ctx.fillText('DANO', COL_DANO, y);
  ctx.fillText('OURO', COL_OURO, y);
  ctx.fillText('CS', COL_CS, y);
  ctx.textAlign = 'left';
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function resumoDosObjetivos(o: MatchTeamStat): string {
  return [
    plural(o.towerKills, 'torre', 'torres'),
    plural(o.dragonKills, 'dragão', 'dragões'),
    plural(o.baronKills, 'barão', 'barões'),
  ].join(' · ');
}

/** Desenha o bloco de um time e devolve onde ele termina. */
function desenharTime(
  ctx: CanvasRenderingContext2D,
  time: Time,
  vencedor: TeamSide | null,
  topo: number,
  icones: Map<string, HTMLImageElement | null>,
  selos: ReadonlyMap<string, SeloConquistado[]>
): number {
  const venceu = time.jogadores[0]?.win ?? vencedor === time.lado;
  const alturaDoBloco = ALTURA_TIME + time.jogadores.length * ALTURA_LINHA;

  // O vencedor ganha fundo tingido de verde: é a primeira coisa que quem abre
  // a imagem no zap procura.
  ctx.fillStyle = venceu ? COR.fundoVitoria : COR.fundoAlterna;
  caixa(ctx, MARGEM - 10, topo, LARGURA - MARGEM * 2 + 20, alturaDoBloco, 10);
  ctx.fill();
  ctx.fillStyle = COR_DO_LADO[time.lado];
  caixa(ctx, MARGEM - 10, topo, 4, alturaDoBloco, 2);
  ctx.fill();

  ctx.textBaseline = 'middle';
  const meio = topo + ALTURA_TIME / 2;
  ctx.font = fonte(14, 700);
  ctx.fillStyle = COR_DO_LADO[time.lado];
  ctx.fillText(NOME_DO_LADO[time.lado], MARGEM + 4, meio);
  const larguraDoNome = ctx.measureText(`${NOME_DO_LADO[time.lado]}   `).width;
  ctx.fillStyle = venceu ? COR.vitoria : COR.derrota;
  ctx.fillText(venceu ? 'VITÓRIA' : 'DERROTA', MARGEM + 4 + larguraDoNome, meio);

  if (time.objetivos) {
    ctx.textAlign = 'right';
    ctx.font = fonte(13);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(resumoDosObjetivos(time.objetivos), LARGURA - MARGEM, meio);
    ctx.textAlign = 'left';
  }

  time.jogadores.forEach((jogador, i) =>
    desenharJogador(
      ctx,
      jogador,
      topo + ALTURA_TIME + i * ALTURA_LINHA,
      icones,
      selos.get(jogador.playerId) ?? []
    )
  );

  ctx.textBaseline = 'alphabetic';
  return topo + alturaDoBloco;
}

function desenharJogador(
  ctx: CanvasRenderingContext2D,
  jogador: MatchStat,
  topo: number,
  icones: Map<string, HTMLImageElement | null>,
  selos: SeloConquistado[]
) {
  const meio = topo + ALTURA_LINHA / 2;
  desenharIcone(ctx, icones.get(jogador.championName), MARGEM + 4, meio - ICONE / 2, ICONE);

  const xDoNome = MARGEM + 4 + ICONE + 12;
  // O nome para antes da coluna de K/D/A, que é a mais larga ("12/10/24").
  const larguraDoNome = COL_KDA - 90 - xDoNome;
  ctx.textBaseline = 'middle';

  // Os emojis dos selos vêm logo depois do nome; o nome encolhe para caber.
  const emojis = selos.map((conquista) => conquista.selo.emoji).join(' ');
  ctx.font = fonte(16);
  const larguraDosEmojis = emojis ? ctx.measureText(emojis).width + 8 : 0;

  ctx.font = fonte(18, 600);
  ctx.fillStyle = COR.texto;
  const nome = cortar(ctx, jogador.player.name, larguraDoNome - larguraDosEmojis);
  ctx.fillText(nome, xDoNome, meio - 9);
  if (emojis) {
    const depoisDoNome = xDoNome + ctx.measureText(nome).width + 8;
    ctx.font = fonte(16);
    ctx.fillText(emojis, depoisDoNome, meio - 9);
  }
  ctx.font = fonte(12);
  ctx.fillStyle = COR.fraco;
  const role = ROLE_LABEL[jogador.rolePlayed] ?? jogador.rolePlayed;
  ctx.fillText(cortar(ctx, `${role} · ${jogador.championName}`, larguraDoNome), xDoNome, meio + 11);

  ctx.textAlign = 'right';
  ctx.font = fonte(17, 700);
  ctx.fillStyle = COR.texto;
  ctx.fillText(`${jogador.kills}/${jogador.deaths}/${jogador.assists}`, COL_KDA, meio);
  ctx.font = fonte(16, 600);
  ctx.fillStyle = COR.apagado;
  ctx.fillText(milhar(jogador.damage), COL_DANO, meio);
  ctx.fillText(milhar(jogador.goldEarned), COL_OURO, meio);
  ctx.fillText(String(jogador.cs), COL_CS, meio);
  ctx.textAlign = 'left';
}

/**
 * "Destaques do jogo": um cartão por selo, em duas colunas.
 *
 * É a parte que vira conversa no zap ("o Kaio morreu 11 vezes"), então o
 * nome do selo vem colorido e o dono vem em branco, grande o bastante para
 * ler na miniatura.
 */
function desenharSelos(ctx: CanvasRenderingContext2D, conquistas: Conquista[], topo: number) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('DESTAQUES DO JOGO', MARGEM, topo + 22);

  const largura = (LARGURA - MARGEM * 2 - ESPACO_SELO) / 2;
  conquistas.forEach((conquista, i) => {
    const x = MARGEM + (i % 2) * (largura + ESPACO_SELO);
    const y = topo + ALTURA_TITULO_SELOS + Math.floor(i / 2) * (ALTURA_SELO + ESPACO_SELO);
    ctx.fillStyle = COR.fundoAlterna;
    caixa(ctx, x, y, largura, ALTURA_SELO, 10);
    ctx.fill();

    const meio = y + ALTURA_SELO / 2;
    ctx.textBaseline = 'middle';
    ctx.font = fonte(22);
    ctx.fillText(conquista.selo.emoji, x + 14, meio);

    const xDoTexto = x + 52;
    const larguraDoTexto = x + largura - 14 - xDoTexto;
    const rotulo = conquista.selo.nome.toUpperCase();
    ctx.font = fonte(12, 700);
    // Zoeira sai do ouro, como nos Destaques: morrer muito não é troféu.
    ctx.fillStyle = conquista.selo.zoeira ? COR.derrota : COR.ouro;
    ctx.fillText(rotulo, xDoTexto, meio - 10);
    const larguraDoRotulo = ctx.measureText(`${rotulo}  `).width;
    ctx.font = fonte(15, 600);
    ctx.fillStyle = COR.texto;
    ctx.fillText(
      cortar(ctx, conquista.nome, larguraDoTexto - larguraDoRotulo),
      xDoTexto + larguraDoRotulo,
      meio - 10
    );
    ctx.font = fonte(12);
    ctx.fillStyle = COR.apagado;
    ctx.fillText(
      cortar(ctx, conquista.selo.descrever(conquista.valor), larguraDoTexto),
      xDoTexto,
      meio + 11
    );
  });
  ctx.textBaseline = 'alphabetic';
}

function desenharBans(
  ctx: CanvasRenderingContext2D,
  times: Time[],
  topo: number,
  icones: Map<string, HTMLImageElement | null>
) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonte(12, 600);
  ctx.fillStyle = COR.fraco;
  ctx.fillText('BANS', MARGEM, topo + 16);

  const yDosIcones = topo + 28;
  times.forEach((time, i) => {
    // Metade da largura para cada time, com a cor do lado na frente.
    const xInicial = i === 0 ? MARGEM : LARGURA / 2 + 10;
    ctx.fillStyle = COR_DO_LADO[time.lado];
    ctx.fillRect(xInicial, yDosIcones, 3, ICONE_DO_BAN);
    time.bans.forEach((ban, k) => {
      desenharIcone(
        ctx,
        ban.championName ? icones.get(ban.championName) : null,
        xInicial + 10 + k * (ICONE_DO_BAN + 6),
        yDosIcones,
        ICONE_DO_BAN
      );
    });
  });
}
