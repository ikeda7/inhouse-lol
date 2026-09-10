import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * Leitura e validacao das variaveis de ambiente num lugar so.
 * Falha rapido no boot se algo obrigatorio faltar, em vez de dar erro estranho
 * no meio de um request.
 *
 * O .env fica na RAIZ do repositorio (um so para front e back), mas os scripts
 * rodam com cwd diferente conforme o comando (`npm run dev` na raiz, `prisma`
 * dentro de server/). Por isso o caminho e resolvido a partir deste arquivo, e
 * nao de process.cwd().
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Sobe a arvore procurando o `.env`.
 *
 * Contar `..` a mao nao serve: em desenvolvimento este arquivo roda de
 * `server/src/lib/`, mas compilado roda de `server/dist/src/lib/` -- um nivel
 * mais fundo. Um numero fixo acerta um caso e erra o outro (e o erro so
 * aparece em producao, que e o pior lugar para descobrir).
 */
function findUpwards(filename: string, from: string, maxLevels = 6): string | null {
  let current = from;
  for (let level = 0; level <= maxLevels; level++) {
    const candidate = path.join(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break; // chegou na raiz do disco
    current = parent;
  }
  return null;
}

// Em container as variaveis vem do ambiente e nao existe .env -- por isso a
// ausencia do arquivo nao e erro. Quem reclama de variavel faltando e o
// `required()` abaixo, com mensagem propria.
const envFile = findUpwards('.env', here);
if (envFile) loadDotenv({ path: envFile });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Copie o .env.example para .env na raiz do projeto e preencha.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

/**
 * Segredo de sessao: obrigatorio em producao, com queda para um valor fixo
 * fora dela.
 *
 * `required()` aqui quebraria o CI e todo clone novo -- nenhum dos dois tem
 * `.env`, e o modulo lanca no import, entao ate `npm test` morria antes de
 * rodar. Em producao a ausencia continua sendo erro de boot, alto e cedo: um
 * segredo publico assinando sessao de verdade seria pior que nao subir.
 */
function segredoDeSessao(nodeEnv: string): string {
  const valor = process.env.JWT_SECRET?.trim();
  if (valor) return valor;

  if (nodeEnv === 'production') {
    throw new Error(
      'Variável de ambiente obrigatória ausente em produção: JWT_SECRET. ' +
        'Gere um segredo com `openssl rand -hex 32` e configure no ambiente.'
    );
  }

  return 'inhouse-dev-secret-nao-use-em-producao';
}

/**
 * Transforma `file:./dev.db` num caminho ABSOLUTO.
 *
 * Sem isso, a mesma URL aponta para dois arquivos diferentes:
 *   - o Prisma CLI (db push, seed) resolve relativo à pasta do SCHEMA
 *     -> server/prisma/dev.db
 *   - o cliente libSQL resolve relativo ao CWD do processo
 *     -> server/dev.db, um arquivo vazio
 *
 * O sintoma é traiçoeiro: nada dá erro de conexão, o app sobe, e só quebra na
 * primeira consulta com "no such table". Ancoramos na pasta do schema, que é o
 * que o CLI usa, para os dois enxergarem o mesmo banco.
 *
 * URLs remotas (libsql://, http://) passam intactas.
 */
function resolverUrlDoBanco(url: string): string {
  if (!url.startsWith('file:')) return url;

  const caminho = url.slice('file:'.length);
  if (path.isAbsolute(caminho)) return url;

  const schema = findUpwards(path.join('prisma', 'schema.prisma'), here);
  if (!schema) return url; // sem schema por perto, deixa como veio

  const absoluto = path.resolve(path.dirname(schema), caminho);
  return `file:${absoluto}`;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3333')),

  /**
   * Arquivo local (file:./dev.db) ou Turso (libsql://...).
   * O adapter libSQL aceita os dois formatos.
   */
  databaseUrl: resolverUrlDoBanco(required('DATABASE_URL')),
  /** Só o Turso exige. Em arquivo local fica vazio. */
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN?.trim() || null,

  /**
   * Chave da Riot. Opcional de proposito: sem ela o app roda inteiro no modo
   * manual (registro de partida por formulario). So a sincronizacao automatica
   * fica indisponivel.
   */
  riotApiKey: process.env.RIOT_API_KEY?.trim() || null,
  /** Roteamento regional para account-v1/match-v5: americas | europe | asia | sea. */
  riotRegionalRoute: optional('RIOT_REGIONAL_ROUTE', 'americas'),
  /** Plataforma para spectator-v5: br1 | na1 | euw1 | ... */
  riotPlatform: optional('RIOT_PLATFORM', 'br1'),

  /** Origem liberada no CORS para o front do Vite. */
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  /** Locale usado nos assets do Data Dragon. */
  ddragonLocale: optional('DDRAGON_LOCALE', 'pt_BR'),

  /** Assina o cookie de sessao das contas de jogador (issue #3). */
  jwtSecret: segredoDeSessao(optional('NODE_ENV', 'development')),

  /**
   * Chave do grupo: com ela definida, toda escrita exige a chave (header
   * x-chave-do-grupo) ou uma conta logada -- inclusive reivindicar conta.
   *
   * Opcional para o deploy nao quebrar o site no dia em que isto sobe: sem a
   * variavel, as escritas continuam abertas como antes e o servidor avisa no
   * log. O /api/health diz se a trava esta ligada.
   */
  groupKey: process.env.GROUP_KEY?.trim() || null,
} as const;

export const hasRiotApi = env.riotApiKey !== null;
