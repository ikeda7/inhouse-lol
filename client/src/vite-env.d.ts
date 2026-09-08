/// <reference types="vite/client" />

/**
 * Tipagem das variaveis de ambiente expostas ao browser.
 *
 * Lembrete: tudo com prefixo VITE_ vai para o bundle publico. Nunca declarar
 * segredo aqui -- a chave da Riot fica so no backend.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
