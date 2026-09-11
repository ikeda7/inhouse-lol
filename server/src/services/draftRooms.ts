/**
 * Salas de draft ao vivo (issue #6).
 *
 * O que muda em relacao ao modo Capitaes normal: o estado sai do cliente e vai
 * para o banco, com um codigo curto que serve de link. Quem abrir o link ve o
 * mesmo draft, e a escolha de um aparece para todos.
 *
 * ATUALIZACAO POR CONSULTA, NAO POR EVENTO. O caminho "certo" seria SSE ou
 * WebSocket, mas a producao roda em funcao serverless da Vercel: conexao longa
 * e cortada pelo limite de duracao, e nao existe processo vivo para segurar
 * assinatura. Consultar a cada poucos segundos e feio no papel e funciona no
 * plano gratis sem mudar nada de infra -- com 10 pessoas e uma noite por
 * semana, o volume e irrisorio.
 *
 * A consulta e barata de proposito: manda a versao que ja tem e recebe corpo
 * vazio quando nada mudou.
 */

import { prisma } from '../lib/prisma.js';
import { applyPick, finalizeCaptainsDraft, type CaptainsDraftState } from '../lib/captainsDraft.js';
import { DraftError } from '../lib/autoBalance.js';
import { randomInt, randomUUID } from 'node:crypto';
import type { TeamSide } from '../lib/roles.js';

/**
 * Alfabeto do codigo, sem 0/O/1/I/L.
 *
 * O codigo vai ser LIDO EM VOZ ALTA numa call antes de virar link. Caractere
 * ambiguo transforma isso em "e o o de bola ou o zero?".
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_DO_CODIGO = 5;

/** Uma sala serve para uma noite de jogos. */
const VALIDADE_HORAS = 12;

/** Quantas vezes tentar de novo se o codigo sorteado ja existir. */
const TENTATIVAS_DE_CODIGO = 5;

/**
 * `randomInt` do crypto, não `Math.random`: o código é o que protege a sala de
 * quem não recebeu o link, e `Math.random` é previsível para quem viu
 * códigos anteriores.
 */
function sortearCodigo(): string {
  let codigo = '';
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return codigo;
}

export interface SalaDeDraft {
  code: string;
  version: number;
  /** Quais lados ja tem dono. Os segredos em si NUNCA saem daqui. */
  claimed: Record<TeamSide, boolean>;
  state: CaptainsDraftState;
  /** Preenchido so quando o draft fecha. */
  teams: ReturnType<typeof finalizeCaptainsDraft> | null;
  expiresAt: string;
}

function montar(row: {
  code: string;
  version: number;
  state: string;
  expiresAt: Date;
  blueToken: string | null;
  redToken: string | null;
}): SalaDeDraft {
  const state = JSON.parse(row.state) as CaptainsDraftState;
  return {
    code: row.code,
    version: row.version,
    claimed: { BLUE: row.blueToken !== null, RED: row.redToken !== null },
    state,
    // Os times saem do estado, nao sao guardados: guardar seria duplicar a
    // verdade e abrir espaco para os dois discordarem.
    teams: state.finished ? finalizeCaptainsDraft(state) : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function criarSala(state: CaptainsDraftState): Promise<SalaDeDraft> {
  const expiresAt = new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000);

  // Varre as vencidas de carona. Nao existe cron aqui, e abrir sala e o unico
  // momento em que alguem se importa com o assunto -- acontece uma vez por
  // noite, e libera os codigos das salas antigas para sorteio.
  await prisma.draftRoom
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_CODIGO; tentativa++) {
    const code = sortearCodigo();
    // Codigo curto colide: 31^5 e bastante, mas nao infinito, e sala antiga
    // ainda ocupa o codigo ate expirar. Tentar de novo custa nada.
    const existe = await prisma.draftRoom.findUnique({ where: { code }, select: { code: true } });
    if (existe) continue;

    const row = await prisma.draftRoom.create({
      data: { code, state: JSON.stringify(state), expiresAt },
    });
    return montar(row);
  }

  throw new DraftError(
    'Não consegui gerar um código livre para a sala. Tente de novo.',
    'ROOM_CODE_EXHAUSTED'
  );
}

export async function buscarSala(code: string): Promise<SalaDeDraft | null> {
  const row = await prisma.draftRoom.findUnique({ where: { code: code.toUpperCase() } });
  if (!row) return null;

  // Sala vencida some da API em vez de ser apagada por rotina: nao existe cron
  // aqui, e uma linha morta no banco nao incomoda ninguem.
  if (row.expiresAt.getTime() < Date.now()) return null;

  return montar(row);
}

/**
 * Pega um lado do draft.
 *
 * Devolve um segredo que o navegador do capitao guarda. Nao e login: e trava
 * contra acidente, para quem esta assistindo nao escolher sem querer.
 */
export async function pegarLado(
  code: string,
  side: TeamSide
): Promise<{ sala: SalaDeDraft; token: string }> {
  const atual = await prisma.draftRoom.findUnique({ where: { code: code.toUpperCase() } });
  if (!atual || atual.expiresAt.getTime() < Date.now()) {
    throw new DraftError('Sala não encontrada ou expirada.', 'ROOM_NOT_FOUND');
  }

  const campo = side === 'BLUE' ? 'blueToken' : 'redToken';
  if (atual[campo] !== null) {
    throw new DraftError(
      `O lado ${side === 'BLUE' ? 'azul' : 'vermelho'} já tem capitão. Peça para liberar.`,
      'SIDE_ALREADY_CLAIMED'
    );
  }

  const token = randomUUID();
  // Repete a condicao "ainda sem dono" na escrita: dois clicando junto no mesmo
  // lado terminariam com dois segredos validos se so a leitura decidisse.
  // A versao sobe junto: a consulta dos outros manda a versao que ja tem, e sem
  // isso recebia "nao mudou" -- ninguem via o lado ocupado ate a proxima escolha.
  const alterados = await prisma.draftRoom.updateMany({
    where: { code: atual.code, [campo]: null },
    data: { [campo]: token, version: { increment: 1 } },
  });

  if (alterados.count === 0) {
    throw new DraftError('Alguém pegou esse lado primeiro.', 'SIDE_ALREADY_CLAIMED');
  }

  return { sala: (await buscarSala(atual.code))!, token };
}

/**
 * Libera um lado.
 *
 * Qualquer um libera, de proposito. A trava existe contra ACIDENTE, nao contra
 * gente mal-intencionada -- e num grupo de amigos, ficar travado porque o
 * celular do capitao morreu e um problema muito mais provavel que sabotagem.
 */
export async function liberarLado(code: string, side: TeamSide): Promise<SalaDeDraft> {
  const sala = await buscarSala(code);
  if (!sala) throw new DraftError('Sala não encontrada ou expirada.', 'ROOM_NOT_FOUND');

  // Versao sobe pelo mesmo motivo de pegarLado: quem esta olhando precisa ver
  // o lado livre na proxima consulta.
  await prisma.draftRoom.update({
    where: { code: sala.code },
    data: { [side === 'BLUE' ? 'blueToken' : 'redToken']: null, version: { increment: 1 } },
  });

  return (await buscarSala(sala.code))!;
}

export async function escolherNaSala(
  code: string,
  playerId: string,
  versaoVista: number,
  token?: string
): Promise<SalaDeDraft> {
  const linha = await prisma.draftRoom.findUnique({ where: { code: code.toUpperCase() } });
  if (!linha || linha.expiresAt.getTime() < Date.now()) {
    throw new DraftError('Sala não encontrada ou expirada.', 'ROOM_NOT_FOUND');
  }
  const sala = montar(linha);

  // A vez e de quem? So o dono DAQUELE lado escolhe -- e se o lado nao tem
  // dono, continua aberto, para a sala nao travar esperando alguem clicar.
  const daVez = sala.state.onTheClock;
  if (daVez) {
    const esperado = daVez === 'BLUE' ? linha.blueToken : linha.redToken;
    if (esperado !== null && esperado !== token) {
      throw new DraftError(
        `A vez é do capitão ${daVez === 'BLUE' ? 'azul' : 'vermelho'}.`,
        'NOT_YOUR_TURN'
      );
    }
  }

  if (sala.version !== versaoVista) {
    throw new DraftError(
      'A sala mudou antes da sua escolha (outra escolha ou um capitão entrando). A tela já foi atualizada.',
      'ROOM_VERSION_CONFLICT'
    );
  }

  const proximo = applyPick(sala.state, playerId);

  // A escrita repete a condicao da versao: entre a leitura acima e este update
  // ainda cabe outra requisicao, e `updateMany` com a versao no filtro faz o
  // banco decidir quem chegou primeiro em vez de nos.
  const alterados = await prisma.draftRoom.updateMany({
    where: { code: sala.code, version: versaoVista },
    data: { state: JSON.stringify(proximo), version: versaoVista + 1 },
  });

  if (alterados.count === 0) {
    throw new DraftError(
      'A sala mudou antes da sua escolha (outra escolha ou um capitão entrando). A tela já foi atualizada.',
      'ROOM_VERSION_CONFLICT'
    );
  }

  return {
    code: sala.code,
    version: versaoVista + 1,
    claimed: sala.claimed,
    state: proximo,
    teams: proximo.finished ? finalizeCaptainsDraft(proximo) : null,
    expiresAt: sala.expiresAt,
  };
}
