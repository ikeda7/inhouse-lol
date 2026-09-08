import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { env } from './lib/env.js';
import { errorHandler } from './routes/helpers.js';
import { playersRouter } from './routes/players.js';
import { draftRouter } from './routes/draft.js';
import { seriesRouter } from './routes/series.js';
import { statsRouter } from './routes/stats.js';
import { riotRouter } from './routes/riot.js';
import { ingestRouter } from './routes/ingest.js';

const app = express();

app.use(cors({ origin: env.corsOrigin }));
// O payload de um jogo do LCU/replay passa de 100 KB. 1 MB seria apertado.
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

app.use('/api/players', playersRouter);
app.use('/api/draft', draftRouter);
app.use('/api/series', seriesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/riot', riotRouter);
app.use('/api/ingest', ingestRouter);

// ---------------------------------------------------------------------------
// Frontend em producao
//
// Servir o build do Vite pelo proprio Express deixa o deploy com UM alvo so:
// um container, uma URL, sem CORS e sem configurar dominio separado para a API.
// Em desenvolvimento isso nao roda -- o Vite serve o front com HMR na :5173 e
// faz proxy do /api para ca.
// ---------------------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));

// A profundidade muda conforme a origem: compilado roda de server/dist/src/,
// mas o tsx em dev roda de server/src/. Em vez de fixar um numero de "..",
// testamos os dois candidatos.
const clientDist = [
  path.resolve(here, '..', '..', '..', 'client', 'dist'), // server/dist/src -> raiz
  path.resolve(here, '..', '..', 'client', 'dist'), // server/src -> raiz
].find(existsSync);

if (clientDist) {
  app.use(express.static(clientDist));

  // Fallback do SPA: qualquer rota que nao seja /api devolve o index.html,
  // senao dar F5 em /jogadores/123 retornaria 404.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else if (env.nodeEnv === 'production') {
  console.warn('[aviso] build do frontend nao encontrado. Rode "npm run build".');
}

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Rota nao encontrada.' });
});

// Precisa vir depois de todas as rotas: o Express identifica o error handler
// pela aridade de 4 parametros.
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`InHouse LoL API em http://localhost:${env.port}`);
  if (clientDist) {
    console.log(`Frontend servido de ${clientDist}`);
  }
});
