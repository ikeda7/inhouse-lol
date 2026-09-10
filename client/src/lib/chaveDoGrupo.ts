/**
 * A chave do grupo, guardada neste navegador.
 *
 * Não é segredo forte -- é a mesma chave que circula no grupo do zap. Serve
 * para separar "quem é do grupo" de "qualquer um que achou o link". Quem tem
 * conta nem precisa dela: a sessão já basta.
 *
 * `localStorage` pode lançar (aba anônima, site bloqueado): tudo aqui engole a
 * falha e trata como "sem chave", e o servidor pede de novo se precisar.
 */

const ONDE = 'inhouse:chave-do-grupo';

/** Mesmo nome que o servidor lê (server/src/middleware/auth.ts). */
export const CABECALHO_DA_CHAVE = 'x-chave-do-grupo';

export function lerChaveDoGrupo(): string | null {
  try {
    return localStorage.getItem(ONDE) || null;
  } catch {
    return null;
  }
}

export function salvarChaveDoGrupo(chave: string): void {
  try {
    localStorage.setItem(ONDE, chave.trim());
  } catch {
    // sem armazenamento, a chave vale só até recarregar -- nada a fazer
  }
}

export function esquecerChaveDoGrupo(): void {
  try {
    localStorage.removeItem(ONDE);
  } catch {
    // idem
  }
}
