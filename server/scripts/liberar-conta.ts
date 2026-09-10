/**
 * Libera a conta de um jogador: apaga e-mail e senha -- e, com a senha, toda
 * sessão aberta dela (ver versaoDaSenha em lib/auth.ts).
 *
 * Para quando alguém reivindicou o jogador errado, por engano ou de propósito.
 * Depois disso o jogador volta para a lista de "Criar conta" e o dono de
 * verdade reivindica. O histórico de partidas não é tocado: a conta é só o
 * login, a identidade é o Player. Foto ENVIADA sai junto (foi quem reivindicou
 * que mandou); ícone do LoL fica.
 *
 * Uso:
 *   npm run conta:liberar --workspace server -- "Nome"               só mostra
 *   npm run conta:liberar --workspace server -- "Nome" --confirmar   libera
 *
 * Em produção, rode com DATABASE_URL e DATABASE_AUTH_TOKEN do Turso no ambiente.
 * O e-mail nunca é impresso: o terminal de quem roda também é "lugar público".
 */

import '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';

const args = process.argv.slice(2);
const confirmar = args.includes('--confirmar');
const nome = args.find((arg) => !arg.startsWith('--'));

async function main() {
  if (!nome) {
    console.error('Informe o nome do jogador: npm run conta:liberar -- "Nome"');
    process.exitCode = 2;
    return;
  }

  const jogador = await prisma.player.findUnique({
    where: { name: nome },
    select: { id: true, name: true, passwordHash: true, photoSource: true },
  });
  if (!jogador) {
    console.error(`Nenhum jogador chamado "${nome}".`);
    process.exitCode = 1;
    return;
  }
  if (!jogador.passwordHash) {
    console.log(`${jogador.name} não tem conta. Nada a liberar.`);
    return;
  }

  const fotoEnviada = jogador.photoSource === 'UPLOAD';
  if (!confirmar) {
    console.log(
      `${jogador.name} tem conta${fotoEnviada ? ' e foto enviada' : ''}. ` +
        'Rode de novo com --confirmar para liberar.'
    );
    return;
  }

  await prisma.player.update({
    where: { id: jogador.id },
    data: {
      email: null,
      passwordHash: null,
      ...(fotoEnviada ? { photoUrl: null, photoSource: 'NONE' } : {}),
    },
  });
  console.log(`Conta de ${jogador.name} liberada. As sessões abertas dela deixaram de valer.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
