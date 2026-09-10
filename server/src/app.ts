import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './lib/env.js';
import { errorHandler } from './routes/helpers.js';
import { playersRouter } from './routes/players.js';
import { draftRouter } from './routes/draft.js';
import { seriesRouter } from './routes/series.js';
import { statsRouter } from './routes/stats.js';
import { riotRouter } from './routes/riot.js';
import { ingestRouter } from './routes/ingest.js';
import { authRouter } from './routes/auth.js';
import { accountsRouter } from './routes/accounts.js';
import { exigirGrupo } from './middleware/auth.js';

/**
 * Monta o app SEM escutar porta.
 *
 * Separado de `index.ts` porque em serverless (Vercel) não existe
 * `app.listen()`: a plataforma importa o handler e chama por invocação. Se o
 * módulo chamasse `listen` no import, o deploy subiria e travaria.
 *
 * Então:
 *   - `app.ts`    monta e exporta        -> usado pelos dois
 *   - `index.ts`  chama listen           -> local, VPS, Docker
 *   - `api/index.ts` exporta o handler   -> Vercel
 */
export function createApp(): Express {
  const app = express();

  // Na Vercel o IP do visitante chega em X-Forwarded-For, posto pela propria
  // plataforma. Sem isto `req.ip` seria o do proxy, e o limite de tentativas
  // do login contaria todo mundo como uma pessoa so.
  if (process.env.VERCEL) app.set('trust proxy', 1);

  // Query string lida pelo `querystring` do Node, nao pelo `qs`. As rotas so
  // usam parametro plano (?limit=, ?since=, ?includeInactive=), e o `qs` que o
  // Express 4 traz preso em ~6.15 tem falha de limite de array ao interpretar
  // chaves com colchete -- que assim nenhuma requisicao alcanca.
  app.set('query parser', 'simple');

  if (env.nodeEnv === 'production' && !env.groupKey) {
    console.warn(
      '[seguranca] GROUP_KEY ausente: qualquer visitante consegue gravar e reivindicar conta.'
    );
  }

  // credentials:true e o cookieParser sao o que fazem o cookie de sessao
  // (issue #3) ir e voltar entre o Vite (:5173) e a API (:3333) em dev --
  // em producao os dois ja saem do mesmo host, entao nao muda nada.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(cookieParser());
  // O payload de um jogo do LCU/replay passa de 100 KB. 1 MB seria apertado.
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      // Dizer SE a trava esta ligada nao entrega nada; e o que permite
      // conferir, depois de configurar a GROUP_KEY, que ela pegou.
      data: { status: 'ok', uptime: process.uptime(), grupoProtegido: env.groupKey !== null },
    });
  });

  // Escrita so para quem e do grupo: conta logada ou chave do grupo. Fica
  // ANTES das rotas e vale para todas -- rota nova ja nasce protegida; as
  // poucas excecoes estao listadas em lib/escritas.ts.
  app.use('/api', exigirGrupo);

  app.use('/api/players', playersRouter);
  app.use('/api/draft', draftRouter);
  app.use('/api/series', seriesRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/riot', riotRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/accounts', accountsRouter);

  montarFrontend(app);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Rota não encontrada.' });
  });

  // Precisa vir depois de todas as rotas: o Express identifica o error handler
  // pela aridade de 4 parâmetros.
  app.use(errorHandler);

  return app;
}

/**
 * Serve o build do Vite pelo próprio Express, quando ele existe.
 *
 * Deixa o deploy com UM alvo só: um container, uma URL, sem CORS. Em
 * desenvolvimento não roda -- o Vite serve o front com HMR na :5173 e faz
 * proxy do /api para cá.
 *
 * Na Vercel o front é servido pela CDN dela (ver vercel.json), então esta
 * função simplesmente não encontra a pasta e sai de fininho.
 */
function montarFrontend(app: Express): void {
  const here = path.dirname(fileURLToPath(import.meta.url));

  // A profundidade muda conforme a origem: compilado roda de server/dist/src/,
  // o tsx em dev roda de server/src/. Em vez de fixar um número de "..",
  // testamos os candidatos.
  const clientDist = [
    path.resolve(here, '..', '..', '..', 'client', 'dist'),
    path.resolve(here, '..', '..', 'client', 'dist'),
  ].find(existsSync);

  if (!clientDist) {
    if (env.nodeEnv === 'production' && !process.env.VERCEL) {
      console.warn('[aviso] build do frontend não encontrado. Rode "npm run build".');
    }
    return;
  }

  app.use(express.static(clientDist));

  // Fallback do SPA: qualquer rota que não seja /api devolve o index.html,
  // senão dar F5 em /jogadores/123 retornaria 404.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
