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
 * Com admin nomeado, o site é só de leitura para todo mundo menos ele. Estas
 * duas listas são as exceções -- fora delas, escrita é só do admin, com a
 * conta dele. O método entra na regra junto com o caminho.
 *
 * Antes existia um nível "do grupo" (chave ou qualquer conta) para abrir a MD3
 * da noite, importar e abrir sala. Só que a chave circulava no zap: com ela
 * dava para reivindicar o jogador de um amigo sem conta e mandar partida
 * forjada pela importação. Não sobrou motivo para outra pessoa gravar.
 */
type Regra = [metodo: string, caminho: RegExp];

/** A própria conta: quem já tem uma mexe no próprio perfil, senha e foto. */
const ESCRITAS_DA_CONTA: Regra[] = [
  ['PATCH', /^\/accounts\/me$/],
  ['POST', /^\/accounts\/me\/(password|photo|photo\/sync-lol)$/],
];

/**
 * O que o agente local faz. Ele roda sem navegador, então não tem sessão: prova
 * que é do admin pela chave (GROUP_KEY), que deixou de ser "do grupo" e fica só
 * no PC de quem importa. A chave vale para ISTO e mais nada -- vazada, o estrago
 * é uma partida importada, não o cadastro.
 */
const ESCRITAS_DO_AGENTE: Regra[] = [
  ['POST', /^\/series\/garantir$/],
  ['POST', /^\/ingest\/(lcu|rofl)$/],
];

/**
 * O sorteio e o draft de capitães não gravam nada, e por isso dispensam a
 * chave no modo sem admin. Com admin eles são dele mesmo assim: quem tira os
 * times da noite é uma pessoa só, e um segundo sorteio rodando no celular de
 * alguém vira "mas no meu deu outro time". Para os outros sobra o draft ao
 * vivo, pelo link da sala que o admin abre (as jogadas dentro dela continuam
 * abertas, em ESCRITAS_ABERTAS).
 */
const CALCULOS_DO_ADMIN: Regra[] = [
  ['POST', /^\/draft\/auto-balance$/],
  ['POST', /^\/draft\/captains\/(start|pick)$/],
];

export type NivelDeEscrita = 'ABERTA' | 'CONTA' | 'AGENTE' | 'ADMIN';

/** `caminho` relativo a /api, como o Express entrega num middleware montado lá. */
export function dispensaChave(metodo: string, caminho: string): boolean {
  if (LEITURA.has(metodo.toUpperCase())) return true;
  return ESCRITAS_ABERTAS.some((regra) => regra.test(caminho));
}

/**
 * Quem pode fazer este pedido quando há admin: qualquer um, o dono da conta, o
 * agente do admin, ou só o admin logado. Sem admin nomeado os níveis não
 * valem, e fica a regra antiga de `dispensaChave` (chave do grupo ou conta).
 */
export function nivelDaEscrita(metodo: string, caminho: string): NivelDeEscrita {
  // O método entra na regra: `DELETE /series/garantir` cai na rota de apagar
  // série, não na de garantir, e não pode pegar carona na exceção.
  const esta = (regras: Regra[]) =>
    regras.some(([doMetodo, regra]) => doMetodo === metodo.toUpperCase() && regra.test(caminho));

  // Antes do "dispensa a chave": esses dois dispensam, mas com admin são dele.
  if (esta(CALCULOS_DO_ADMIN)) return 'ADMIN';
  if (dispensaChave(metodo, caminho)) return 'ABERTA';
  if (esta(ESCRITAS_DA_CONTA)) return 'CONTA';
  return esta(ESCRITAS_DO_AGENTE) ? 'AGENTE' : 'ADMIN';
}

/**
 * `jogadorId` é o dono da sessão (null = sem conta).
 *
 * Sem admin configurado todo mundo do grupo pode, como sempre foi: a trava só
 * passa a existir quando alguém é nomeado (ver env.adminPlayerIds).
 */
export function podeAdministrar(jogadorId: string | null, admins: readonly string[]): boolean {
  if (admins.length === 0) return true;
  return jogadorId !== null && admins.includes(jogadorId);
}
