# Comece aqui

Guia para subir o projeto numa máquina nova. Se você acabou de clonar, leia isto
antes de qualquer outra coisa.

Os outros documentos: [README](README.md) (o que o app faz) ·
[ARCHITECTURE](ARCHITECTURE.md) (por que o código é assim) ·
[DEPLOY](DEPLOY.md) (como publicar) · [CONTRIBUTING](CONTRIBUTING.md).

---

## 1. Subir em 5 minutos

Precisa de **Node.js 20+**.

```bash
git clone https://github.com/ikeda7/inhouse-lol.git
cd inhouse-lol

npm install          # instala os dois workspaces (server e client)
cp .env.example .env # os valores padrão já funcionam para desenvolvimento
npm run db:push      # cria o SQLite local e gera o Prisma Client
npm run db:seed      # popula com a base inicial de jogadores
npm run dev          # API em :3333, front em :5173
```

Abra <http://localhost:5173>.

> **Você não precisa de `RIOT_API_KEY`.** O caminho principal de importação usa
> o cliente do LoL, não a API pública, e dispensa chave. O `.env.example`
> funciona como está.

Confira que ficou tudo de pé:

```bash
npm run typecheck    # os dois workspaces
npm test             # 131 testes (101 no back, 30 no front)
npm run build
```

---

## 2. O que NÃO vem no clone

Três arquivos são gitignored e você vai precisar deles só para tarefas
específicas. Nenhum é necessário para desenvolver.

| Arquivo | Para quê | Onde conseguir |
|---|---|---|
| `.env` | rodar local | `cp .env.example .env` — pronto |
| `.env.turso` | aplicar schema no banco de produção | painel do Turso |
| `.env.vercel` | operar o deploy pela CLI | painel da Vercel |

`.env.turso` precisa de duas linhas:

```
DATABASE_URL="libsql://inhouse-lol-ikeda7.aws-us-east-1.turso.io"
DATABASE_AUTH_TOKEN="<token do painel>"
```

Sem ele você desenvolve normalmente — só não consegue rodar
`npm run db:turso`, que é o comando que leva mudança de schema para produção.

---

## 3. O ciclo de trabalho

O projeto usa GitFlow. **`develop` é a branch de integração e `main` é o que
está no ar** — todo push em `main` dispara deploy de produção na Vercel.

```bash
git checkout develop
git pull origin develop
git checkout -b feat/nome-curto      # ou fix/, chore/, docs/, refactor/

# ... trabalha ...

npm run typecheck && npm test        # antes de commitar
git commit -m "feat: o que mudou"
git push -u origin feat/nome-curto
gh pr create --base develop
```

Para publicar, `develop` vai para `main` **também por PR**:

```bash
gh pr create --base main --head develop --title "deploy: <o que vai no ar>"
gh pr merge --merge                  # <- isto publica
```

> **Cuidado que já custou tempo:** push em `develop` gera *preview* na Vercel,
> não produção. Se a mudança não aparece no site, provavelmente ela está só em
> `develop`.

### As duas branches são protegidas

`git push origin develop` e `git push origin main` **são recusados pelo
servidor**. Não é convenção, é regra do GitHub:

```
remote: error: GH006: Protected branch update failed for refs/heads/develop.
remote: - Changes must be made through a pull request.
remote: - 2 of 2 required status checks are expected.
```

O que está ligado nas duas:

| Regra | Por quê |
|---|---|
| PR obrigatório, **0 aprovações** | força o fluxo sem travar quem trabalha sozinho — não dá para aprovar o próprio PR |
| CI obrigatório (testes + segredos) | nada entra vermelho |
| Vale para admin também | sem isso a proteção não protegeria justamente de quem mais empurra código |
| Sem force push, sem apagar branch | histórico de `main` é o que está no ar |
| Conversas resolvidas | comentário de review não some no merge |

Uma diferença entre as duas: `develop` exige a branch **atualizada** antes do
merge (evita "verde sozinho, quebrado depois do merge"); `main` não exige,
porque ela tem commits de merge que nunca voltam para `develop` e a regra
deixaria o deploy permanentemente bloqueado.

**Emergência.** Você é admin: dá para suspender a proteção pelo painel
(*Settings → Branches*) ou por linha de comando, publicar, e religar. É
deliberado que não exista bypass silencioso — desligar aparece no histórico do
repositório, um push direto não apareceria.

```bash
gh api -X DELETE repos/ikeda7/inhouse-lol/branches/main/protection   # desliga
# ... publica ...
# religa depois: ver o JSON em Settings → Branches, ou peça para o Claude
```

---

## 4. Comandos que você vai usar

```bash
npm run dev              # API + front juntos
npm test                 # os dois workspaces
npm run test:server      # só o back
npm run test:client      # só o front
npm run typecheck
npm run db:studio        # Prisma Studio, para olhar o banco
npm run db:seed          # base inicial de jogadores
npm run db:recompute     # recalcula os placares das MD3 a partir dos jogos
npm run db:turso -- --schema-only   # leva mudança de schema para produção
```

### Mudou o schema? A sequência é esta

```bash
# 1. edite server/prisma/schema.prisma
npm run db:push                      # aplica no banco local
npm run db:turso -- --schema-only    # aplica no Turso (produção)
# 2. depois do deploy, com o cliente do LoL aberto:
node companion/inhouse-companion.mjs --refresh-all --api https://inhouse-lol.vercel.app/api
```

O último passo preenche as colunas novas nas partidas que já estavam
registradas. Sem ele, elas ficam em zero — e a tela mostra zero, não erro.

---

## 5. Importar partidas

Dado de custom game **não existe na API pública da Riot**. Ele vive na máquina
de quem jogou, e só enquanto o cliente do LoL ainda tem a partida em cache.

```bash
# com o cliente do LoL ABERTO
node companion/inhouse-companion.mjs --list        # o que dá para importar
node companion/inhouse-companion.mjs --last        # manda o último custom
node companion/inhouse-companion.mjs --refresh-all # atualiza as já registradas
```

Acrescente `--api https://inhouse-lol.vercel.app/api` para mandar para produção
em vez do servidor local.

Variáveis opcionais (lidas do shell, não do `.env` — o agente não tem
dependências):

| Variável | Para quê |
|---|---|
| `INHOUSE_API_URL` | mesmo que `--api` |
| `INHOUSE_SERIES_ID` | mesmo que `--series` |
| `LEAGUE_INSTALL_DIR` | se o LoL não está no caminho padrão |
| `LEAGUE_REPLAYS_DIR` | se os `.rofl` estão em outra pasta |

---

## 6. O que fazer amanhã

O backlog vive nas [issues](https://github.com/ikeda7/inhouse-lol/issues). O
que está aberto, em ordem de retorno:

### Esperando o mundo, não código

- **#72 — Prisma major.** O alerta alto do `npm audit` só sai com a `8.1.0`
  estável, que ainda não existe (em 11/09 a mais nova é `8.0.0-rc.13`). Só a CLI
  lê o código afetado. No mesmo issue: os 2 moderados do `qs` só somem com o
  Express 5, e nenhuma requisição chega nesse `qs` (`query parser: simple`).

### Feito e no ar — falta você conferir na prática

**#3 — contas de jogador** está em produção desde 09/09/2026. Login é e-mail e
senha; a foto vem do ícone do LoL, com upload próprio como opção.

Foi conferido por API e por navegador, mas **ninguém usou como usuário de
verdade ainda**. É o primeiro item da lista quando você sentar:

1. Abrir <https://inhouse-lol.vercel.app/criar-conta>, escolher seu nome na
   lista e criar a conta.
2. Em **/conta**, preencher o Riot ID e clicar em **"Usar ícone do LoL"** — é
   o único caminho que depende da Riot API e que não deu para exercitar de
   ponta a ponta (precisa de `RIOT_API_KEY` válida; sem ela a resposta é
   503 `RIOT_DISABLED`, e o botão de upload continua funcionando).
3. Testar o upload de foto pelo celular, que é onde o recorte quadrado e o
   redimensionamento importam.

Se algo estiver errado, o que fazer depende de onde:

| Sintoma | Onde olhar |
|---|---|
| Toda rota da API caindo | `JWT_SECRET` sumiu das variáveis da Vercel |
| Só as rotas de conta com erro | schema do Turso — `npm run db:turso -- --schema-only` |
| "Usar ícone do LoL" em 503 | `RIOT_API_KEY` (chave de dev expira a cada 24h) |

### Coisas que eu faria a seguir, se fosse escolher

1. **Reimportar depois de cada noite virou hábito manual.** Vale um comando só
   (`--watch` já existe, mas ninguém lembra de deixar rodando).
2. **Teste de componente das barras e da vez.** `Select` (teclado e portal)
   entrou em 11/09; os que faltam com regra de verdade são
   `MatchPlayerDetail` (as barras de comparação) e `CaptainsDraft` (de quem é
   a vez). A vez da sala ao vivo já é coberta pelo fluxo de dois navegadores.

Feito em 11/09 e fora desta lista: a aba Série em duas colunas com "A MD3 até
agora" e o placar por elenco; o `autoBalance` de 200 sorteios roda em ~1s e
ganhou timeout próprio; stats da MD3 inteira (#97).

---

## 7. Coisas que não são óbvias e vão te economizar tempo

**O placar da MD3 é por elenco, não por cor.** Times trocam de lado entre jogos;
contar BLUE/RED transforma um 2-0 em 1-1. Se mexer nisso, `npm run db:recompute`
reconstrói tudo a partir dos jogos.

**`dist/` não é testado, mas já foi.** O vitest sem `include` explícito varria a
pasta inteira e rodava os testes do último build — verde que não significava
nada. Os dois workspaces têm `vitest.config.ts` justamente por isso; não remova.

**`CREATE TABLE IF NOT EXISTS` não é migração.** O `migrate-to-turso.ts` compara
coluna a coluna com o que o SQLite guardou e emite os `ALTER TABLE` que faltam.
Antes disso, coluna nova simplesmente nunca chegava em produção — em silêncio.

**`lib/` não importa framework.** É a parte cara do projeto (o algoritmo de
sorteio, os parsers do cliente e do replay) e portaria para outra stack sem
alteração. Se for mexer, mantenha assim.
