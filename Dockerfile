# ---------------------------------------------------------------------------
# InHouse LoL -- imagem unica: API Express + frontend Vite ja buildado.
#
# Multi-stage para a imagem final nao carregar toolchain de build.
# ---------------------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

# Copia so os manifestos primeiro: com o codigo inalterado, o Docker reaproveita
# a camada de dependencias e o build fica bem mais rapido.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .

# `prisma generate` precisa rodar antes do tsc: o client gerado e o que fornece
# os tipos do banco.
RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build

# --- imagem final ---------------------------------------------------------
FROM node:22-slim AS runtime

# openssl e exigido pelo engine do Prisma na imagem slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# O volume persistente e montado aqui. Sem isso, o SQLite morre a cada deploy.
ENV DATABASE_URL="file:/data/inhouse.db"
VOLUME /data

EXPOSE 3333

# `db push` no boot cria/atualiza o schema no volume antes de subir a API.
CMD ["sh", "-c", "npx prisma db push --schema=server/prisma/schema.prisma --skip-generate && node server/dist/src/index.js"]
