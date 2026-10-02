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

/**
 * O que o GRUPO (chave ou qualquer conta) pode gravar quando existe admin.
 *
 * De novo uma lista de exceções: fora daqui, escrita é só do admin. A chave
 * circula no zap e toda conta do grupo vale como ela -- sem esta separação,
 * qualquer um dos dois renomeava jogador, trocava Riot ID, desativava gente,
 * registrava partida na mão e encerrava a MD3 dos outros.
 */
const ESCRITAS_DO_GRUPO: [metodo: string, caminho: RegExp][] = [
  // Reivindicar o próprio jogador e mexer na própria conta (as rotas de
  // /accounts/me ainda exigem sessão, e só alcançam quem está logado).
  ['POST', /^\/auth\/register$/],
  ['PATCH', /^\/accounts\/me$/],
  ['POST', /^\/accounts\/me\/(password|photo|photo\/sync-lol)$/],
  // A noite de jogo anda sem o admin: abrir a MD3 da noite ("Usar esses times
  // na série" e o companion), importar do cliente do LoL e abrir a sala do
  // draft ao vivo.
  ['POST', /^\/series\/garantir$/],
  ['POST', /^\/ingest\/(lcu|rofl)$/],
  ['POST', /^\/draft\/rooms$/],
];

export type NivelDeEscrita = 'ABERTA' | 'GRUPO' | 'ADMIN';

/** `caminho` relativo a /api, como o Express entrega num middleware montado lá. */
export function dispensaChave(metodo: string, caminho: string): boolean {
  if (LEITURA.has(metodo.toUpperCase())) return true;
  return ESCRITAS_ABERTAS.some((regra) => regra.test(caminho));
}

/** Quem pode fazer este pedido: qualquer um, o grupo ou só o admin. */
export function nivelDaEscrita(metodo: string, caminho: string): NivelDeEscrita {
  if (dispensaChave(metodo, caminho)) return 'ABERTA';
  // O método entra na regra: `DELETE /series/garantir` cai na rota de apagar
  // série, não na de garantir, e não pode pegar carona na exceção.
  const doGrupo = ESCRITAS_DO_GRUPO.some(
    ([doMetodo, regra]) => doMetodo === metodo.toUpperCase() && regra.test(caminho)
  );
  return doGrupo ? 'GRUPO' : 'ADMIN';
}

/**
 * `jogadorId` é o dono da sessão (null = sem conta, só a chave do grupo).
 *
 * Sem admin configurado todo mundo do grupo pode, como sempre foi: a trava só
 * passa a existir quando alguém é nomeado (ver env.adminPlayerIds).
 */
export function podeAdministrar(jogadorId: string | null, admins: readonly string[]): boolean {
  if (admins.length === 0) return true;
  return jogadorId !== null && admins.includes(jogadorId);
}
