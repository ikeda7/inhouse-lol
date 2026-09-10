/**
 * Quais pedidos passam sem a chave do grupo quando ela está ligada.
 *
 * A lista é de EXCEÇÕES, não de rotas protegidas: toda escrita nova nasce
 * exigindo a chave (ou uma conta), e abrir uma exige mexer aqui, de propósito
 * e com o motivo escrito do lado. O contrário -- listar o que proteger -- é o
 * jeito clássico de uma rota nova sair aberta sem ninguém perceber.
 */

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

const ESCRITAS_ABERTAS: RegExp[] = [
  // Entrar e sair da própria conta: quem tem conta não sabe a chave, e é para
  // isso mesmo -- a conta já prova que é do grupo.
  /^\/auth\/(login|logout)$/,
  // Só calculam times a partir do cadastro; não gravam nada.
  /^\/draft\/auto-balance$/,
  /^\/draft\/captains\/(start|pick)$/,
  // A sala já é protegida pelo código dela e pelo segredo de cada capitão, e
  // é usada por quem abriu o link na hora -- nem todo mundo tem conta.
  /^\/draft\/rooms\/[A-Za-z0-9]+\/(pick|claim|release)$/,
];

/** `caminho` relativo a /api, como o Express entrega num middleware montado lá. */
export function dispensaChave(metodo: string, caminho: string): boolean {
  if (LEITURA.has(metodo.toUpperCase())) return true;
  return ESCRITAS_ABERTAS.some((regra) => regra.test(caminho));
}
