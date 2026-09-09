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
import {
  applyPick,
  finalizeCaptainsDraft,
  type CaptainsDraftState,
} from '../lib/captainsDraft.js';
import { DraftError } from '../lib/autoBalance.js';

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

function sortearCodigo(): string {
  let codigo = '';
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

export interface SalaDeDraft {
  code: string;
  version: number;
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
}): SalaDeDraft {
  const state = JSON.parse(row.state) as CaptainsDraftState;
  return {
    code: row.code,
    version: row.version,
    state,
    // Os times saem do estado, nao sao guardados: guardar seria duplicar a
    // verdade e abrir espaco para os dois discordarem.
    teams: state.finished ? finalizeCaptainsDraft(state) : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function criarSala(state: CaptainsDraftState): Promise<SalaDeDraft> {
  const expiresAt = new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000);

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
    'Nao consegui gerar um codigo livre para a sala. Tente de novo.',
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
 * Aplica uma escolha na sala.
 *
 * `versaoVista` e o que impede escolha dupla: os dois capitaes podem clicar no
 * mesmo segundo, e sem isso a segunda gravacao sobrescreveria a primeira -- o
 * jogador escolhido pelo primeiro voltaria para o pote, e ninguem entenderia
 * por que.
 */
export async function escolherNaSala(
  code: string,
  playerId: string,
  versaoVista: number
): Promise<SalaDeDraft> {
  const sala = await buscarSala(code);
  if (!sala) {
    throw new DraftError('Sala nao encontrada ou expirada.', 'ROOM_NOT_FOUND');
  }

  if (sala.version !== versaoVista) {
    throw new DraftError(
      'Alguem escolheu antes de voce. A tela ja foi atualizada.',
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
      'Alguem escolheu antes de voce. A tela ja foi atualizada.',
      'ROOM_VERSION_CONFLICT'
    );
  }

  return {
    code: sala.code,
    version: versaoVista + 1,
    state: proximo,
    teams: proximo.finished ? finalizeCaptainsDraft(proximo) : null,
    expiresAt: sala.expiresAt,
  };
}
