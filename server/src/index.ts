import { createApp } from './app.js';
import { env } from './lib/env.js';

/**
 * Entrada para execução com processo próprio: local, VPS, Docker.
 *
 * Em serverless este arquivo NÃO é usado -- ver `api/index.ts`, que exporta o
 * handler sem escutar porta.
 */
const app = createApp();

app.listen(env.port, () => {
  console.log(`InHouse LoL em http://localhost:${env.port}`);
});
