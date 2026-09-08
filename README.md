# InHouse LoL

[![CI](https://github.com/ikeda7/inhouse-lol/actions/workflows/ci.yml/badge.svg)](https://github.com/ikeda7/inhouse-lol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Gerenciador das noites de custom game 5x5 de League of Legends de um grupo de
amigos. Sorteia os times respeitando o pool de posições de cada um, controla o
**Fearless Draft** ao longo da MD3 e guarda as estatísticas de todo mundo.


Nasceu de um problema chato de resolver na mão: com 10 pessoas e pools de role
diferentes, montar dois times válidos (Top/Jungle/Mid/ADC/Support dos dois
lados) sem ninguém ficar de fora da própria main é um quebra-cabeça — ainda
mais quando metade do grupo é Fill.

---

## O que ele faz

**Sorteio automático (Auto-Balance)** — escolhe quem veio hoje e o sistema
divide os 10 em dois times completos. O algoritmo resolve primeiro quem tem
pool restrito (quem só joga Top/ADC entra antes) e usa quem marcou **Fill** por
último, para tapar as lacunas. Nunca repete role no mesmo time.

**Modo Capitães** — escolhe os 2 capitães (maior winrate, sorteio entre quem
perdeu o último mapa, ou aleatório) e conduz o snake draft `1-2-2-2-2-1`. No
fim, distribui as roles dentro de cada time.

**Fearless Draft** — os campeões usados no Jogo 1 e no Jogo 2 ficam travados
para o resto da MD3. A tela da noite de jogos mostra os "queimados" com os
ícones oficiais do Data Dragon.

**Registro de partida** — um agente local lê o histórico do cliente do LoL (que,
ao contrário da API pública, inclui custom games) e manda o scoreboard completo.
Também dá para colar o Match ID ou preencher o formulário manual. Ver
*Puxando os dados das partidas* abaixo.

**Estatísticas** — classificação geral (pontos, winrate, KDA), perfil individual
com dano por minuto, winrate por role e pódio dos 3 campeões mais jogados.

Pontuação: **+3** por mapa vencido, **+1** de bônus para quem vence a MD3.

### O placar da MD3 é por elenco, não por cor

Detalhe que parece pequeno e não é. Em custom os times **trocam de lado entre
os jogos**. Se o placar contasse vitórias por azul/vermelho, uma MD3 em que os
mesmos 5 vencem os dois jogos de lados diferentes viraria **1-1** em vez de
**2-0** — a série nunca fecharia e ninguém levaria o bônus.

Isso aconteceu de verdade aqui (MD3 de 07/09/2026) e deixou jogadores com o
mesmo retrospecto 2-2 com pontuações diferentes.

A identidade de um time é o **conjunto de jogadores**. O sistema ancora no jogo
1 — quem estava de azul nele é o "Time 1" — e classifica os jogos seguintes por
sobreposição de elenco (maioria de 5). Isso tolera até uma substituição.

Se a regra mudar, ou se você corrigir um jogo antigo, dá para reconstruir todos
os placares a partir dos jogos:

```bash
npm run db:recompute -- --dry-run   # mostra o que mudaria
npm run db:recompute                # aplica
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS v4 + Lucide Icons |
| Backend | Node.js + Express + TypeScript |
| Banco | SQLite via Prisma ORM |
| Externo | Riot Games API · LCU (cliente do LoL) · Data Dragon (ícones) |
| Testes | Vitest |

Monorepo com npm workspaces: [`server/`](server/) e [`client/`](client/).

**Documentação:** [ARCHITECTURE.md](ARCHITECTURE.md) (por que o código é assim) ·
[DEPLOY.md](DEPLOY.md) (como publicar) · [CONTRIBUTING.md](CONTRIBUTING.md) (como contribuir)

---

## Rodando localmente

Precisa de **Node.js 20+**.

```bash
# 1. Dependências (a raiz instala os dois workspaces)
npm install

# 2. Variáveis de ambiente
cp .env.example .env

# 3. Cria o banco SQLite e gera o Prisma Client
npm run db:push

# 4. Popula com a base inicial de jogadores
npm run db:seed

# 5. Sobe API (:3333) e front (:5173) juntos
npm run dev
```

Abra <http://localhost:5173>.

> **A `RIOT_API_KEY` é opcional e você provavelmente não precisa dela.** O
> caminho principal de importação usa o cliente do LoL, não a API pública — e
> esse caminho dispensa chave. A chave só serve para importar por Match ID ou
> pelo spectator. Ela sai em <https://developer.riotgames.com/> e a versão de
> desenvolvimento expira a cada 24 horas.

### Outros comandos

```bash
npm test           # testes do algoritmo de draft e do parser do cliente
npm run typecheck  # checagem de tipos dos dois workspaces
npm run db:studio  # Prisma Studio, para olhar o banco
npm run db:recompute # recalcula os placares das MD3 a partir dos jogos
npm run build      # build de produção
```

---

## Puxando os dados das partidas

Este é o problema central de um app de inhouse, e vale entender por quê.

**A API pública da Riot não lista custom games.** O endpoint
`/lol/match/v5/matches/by-puuid/{puuid}/ids` só devolve filas oficiais. Não
existe "buscar meus últimos inhouses" — a limitação é deliberada, não um bug.

**Mas o cliente do LoL lista.** Ele mantém o próprio histórico, e nele os
customs aparecem. O cliente expõe esse histórico numa API local (a **LCU API**)
em `127.0.0.1`, numa porta aleatória protegida por senha — porta e senha ficam
num arquivo `lockfile` na pasta de instalação. É o mesmo mecanismo que Blitz,
Porofessor e OP.GG Desktop usam.

### O agente local

[`companion/inhouse-companion.mjs`](companion/inhouse-companion.mjs) lê esse
histórico e manda para o InHouse. **Zero dependências**, roda com `node`. Uma
pessoa do grupo executa — de preferência quem hospeda o custom.

```bash
node companion/inhouse-companion.mjs --list      # lista os customs recentes
node companion/inhouse-companion.mjs --last      # manda o último custom
node companion/inhouse-companion.mjs --watch     # manda sozinho ao fim de cada jogo
node companion/inhouse-companion.mjs --game 3280827724   # manda um gameId específico
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `--games <id,id>` | importa várias de uma vez |
| `--who [ids]` | lista os Riot IDs de quem joga os customs |
| `--replays` / `--replay <id>` | importa de arquivo de replay |

Extras: `--dry-run` (confere sem gravar), `--criar-faltantes` (cadastra
desconhecidos com o nick, para renomear depois), `--api <url>`, `--series <id>`.

Requisitos: **Node 18+**. O cliente do LoL precisa estar aberto para os comandos
de histórico; os de replay leem arquivo em disco e funcionam com o jogo fechado.
Nada para instalar.

### Quanto histórico dá para puxar

O LCU tem **dois** endpoints de histórico, e a diferença entre eles é grande —
vale saber qual é qual antes de concluir que uma partida "sumiu":

| Endpoint | Retorno |
|---|---|
| `.../products/lol/current-summoner/matches` | **20 jogos**, e ignora `begIndex` — paginar devolve sempre os mesmos 20 |
| `.../products/lol/{puuid}/matches` | **~100 jogos**, cerca de **1 mês** |

Medido numa conta real: o primeiro devolveu 20 partidas (2 customs); o segundo,
**101 partidas (13 customs)**. O agente usa o segundo — o primeiro é uma
armadilha que faz parecer que os inhouses de duas semanas atrás desapareceram.

O `--list` agrupa por noite, então uma MD3 aparece junta:

```
03/09/2026  (3 jogos)
   3279275628  21:14  32min
   3279294765  21:56  29min
   3279316571  22:32  14min
```

### Mais antigo que isso: replays

Passou de ~1 mês, o jeito é o arquivo de replay — ele guarda o scoreboard
para sempre e funciona **com o jogo fechado**:

```bash
node companion/inhouse-companion.mjs --replays              # lista os .rofl salvos
node companion/inhouse-companion.mjs --replay 3280827724    # importa um deles
```

Para o LoL salvar sozinho daqui pra frente: **Configurações > Replays >
"Gravar automaticamente as partidas"**. Sem isso ligado, partidas muito antigas
só entram pelo formulário manual.

> **Segurança:** o token do lockfile dá acesso total ao cliente do LoL. Ele fica
> só em memória e nunca é enviado ao servidor — só os dados da partida são.

### Vinculando as contas (passo único)

Para o sistema saber quem é quem no scoreboard, cada jogador precisa do
**Riot ID** preenchido na tela *Jogadores* (formato `Nick#TAG`).

**Isso não precisa da chave da Riot API.** O PUUID vem junto com os dados do
jogo: na primeira importação o servidor casa `riotId` → PUUID sozinho e guarda.
Da segunda vez em diante o reconhecimento é automático.

Se alguém não estiver vinculado, a importação **recusa a partida inteira** e diz
exatamente quais Riot IDs faltam — gravar 8 de 10 corromperia a classificação em
silêncio.

### Os outros caminhos

| Caminho | Quando usar |
|---|---|
| **Agente local (LCU)** | Padrão. Scoreboard completo, automático. ~1 mês de histórico. |
| **Replay .rofl** | Mais antigo que isso. Precisa do replay salvo. |
| **Match ID na API pública** | Alguém anotou o ID. `POST /api/riot/import`. Precisa da chave. |
| **Spectator** | Captura o ID durante o jogo. `POST /api/riot/sync-last`. Precisa da chave. |
| **Formulário manual** | Sempre disponível, sem chave nenhuma. |

O formulário manual **não é plano B improvisado**: como a API pública não cobre
o caso de uso, ele é um caminho de primeira classe. Se os times vieram do
sorteio, os 10 lugares já chegam preenchidos — sobra digitar campeão e KDA.

### O que conta como partida válida

Só **5x5 no Summoner's Rift**. A verificação é por `mapId` e `gameMode` — não
por número de jogadores. Sem isso, um ARAM de 10 pessoas entraria e estragaria a
estatística: lá não existe lane, e dano/CS por minuto seguem outra escala, o que
tornaria o "winrate por role" ficção.

Valores observados em partidas reais do grupo:

| | mapId | gameMode | queueId | |
|---|---|---|---|---|
| Custom na Fenda, draft de torneio | 11 | CLASSIC | 3130 | **conta** |
| Abismo Uivante | 12 | KIWI | 3270 | não conta |

A recusa diz o motivo real (*"foi no Abismo Uivante"*), não um genérico.

### Detalhe sobre as posições

Em custom game o cliente frequentemente não infere a posição de cada jogador
(`lane` vem vazia, ou dois jogadores marcados como "MID"). Quando isso acontece,
o sistema resolve as roles que sobraram usando o **pool declarado** de cada
jogador, e sinaliza `rolesFullyInferred: false` para a tela pedir conferência.

## Deploy

Em produção o Express serve **também o frontend já buildado**, então o deploy
tem um alvo só: uma URL, sem CORS e sem domínio separado para a API.

```bash
npm run build   # compila server + client
npm start       # sobe tudo na :3333
```

**Instruções passo a passo em [DEPLOY.md](DEPLOY.md).** Resumo:

| Camada | Onde | Custo |
|---|---|---|
| Banco | **Turso** (SQLite hospedado) | grátis |
| App | **Vercel** | grátis |

Por que não SQLite em arquivo na nuvem: Vercel e afins têm filesystem efêmero.
O arquivo some a cada deploy e a escrita **não dá erro** — ela desaparece, que é
pior. Por que Turso e não Postgres: mantém o mesmo motor em dev e em produção,
evitando a divergência silenciosa que gera "na minha máquina funciona".

Alternativas que rodam o mesmo código, sem alteração:

- **Rede local** — `npm start` e o pessoal acessa pelo seu IP. Zero custo, mas
  depende do seu PC ligado.
- **VPS** (~R$25/mês) — [`Dockerfile`](Dockerfile) pronto. O SQLite volta a ser
  arquivo e o Turso vira opcional.
- **Fly.io** — [`fly.toml`](fly.toml) pronto, com volume persistente.

> **O app não tem autenticação.** Quem tiver o link mexe em tudo. Para um link
> não divulgado entre amigos costuma bastar, mas leia o aviso em
> [DEPLOY.md](DEPLOY.md) antes de compartilhar.

---

## Estrutura

Detalhes e o **porquê** de cada decisão em [ARCHITECTURE.md](ARCHITECTURE.md).

```
inhouse-lol/
├─ api/index.ts               handler serverless (Vercel)
├─ companion/                 agente que lê o cliente do LoL
├─ server/
│  ├─ prisma/
│  │  ├─ schema.prisma        Player, Series, Match, BurnedChampion
│  │  └─ seed.ts              base inicial (apelidos genéricos)
│  ├─ scripts/
│  │  └─ recompute-series.ts  recalcula os placares das MD3
│  └─ src/
│     ├─ app.ts               monta o Express, sem escutar porta
│     ├─ index.ts             escuta porta (local, VPS, Docker)
│     ├─ lib/                 ← lógica pura, sem framework
│     │  ├─ autoBalance.ts       o algoritmo de sorteio
│     │  ├─ captainsDraft.ts     snake draft 1-2-2-2-2-1
│     │  ├─ lcu.ts               histórico do cliente do LoL
│     │  ├─ rofl.ts              arquivos de replay
│     │  ├─ riot.ts              API pública da Riot
│     │  ├─ ddragon.ts           ícones oficiais
│     │  └─ roles.ts             roles canônicas
│     ├─ services/            regras de negócio
│     ├─ routes/              endpoints Express
│     └─ __tests__/           53 testes
└─ client/src/
   ├─ pages/                  Ranking, Sorteio, Noite, Histórico, Perfil
   ├─ components/             Select, ChampionPicker, MatchForm, TeamCard...
   ├─ hooks/
   ├─ index.css               tokens do sistema visual
   └─ api/client.ts           cliente HTTP tipado
```

**`lib/` não importa framework nenhum.** É a parte cara do projeto — o
algoritmo e os parsers descobertos por engenharia reversa — e portaria para
outra stack sem alteração.

### Como o Auto-Balance funciona

O problema é um **emparelhamento perfeito em grafo bipartido**: 10 jogadores
para 10 vagas (2 lados × 5 roles), com aresta onde a role está no pool do
jogador. Em [`server/src/lib/autoBalance.ts`](server/src/lib/autoBalance.ts):

1. **Viabilidade** — o Teorema de Hall diz, em 32 verificações, se a composição
   é possível. Quando não é, o erro aponta o gargalo exato: *"5 jogadores só
   jogam TOP, mas existem apenas 2 vagas"*, em vez de um "não foi possível
   sortear" inútil.
2. **Busca** — backtracking com heurística MRV (*Minimum Remaining Values*):
   a cada passo aloca o jogador com **menos vagas disponíveis**. É o que
   implementa "gargalo primeiro, Fill por último" — e de forma dinâmica,
   reagindo ao que as escolhas anteriores já consumiram.
3. **Escolha** — existem várias soluções válidas; o sistema avalia milhares com
   restarts independentes e fica com a de menor custo: diferença de rating +
   desconforto de role + concentração de autofill num lado só.

Cada sorteio devolve a **seed** usada. Passar a mesma seed de volta reproduz
exatamente os mesmos times — útil quando alguém contesta o resultado.

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/players` | Lista jogadores |
| `POST` | `/api/players` | Cadastra (roles em ordem de preferência) |
| `PATCH` | `/api/players/:id` | Atualiza nome, roles, Riot ID |
| `GET` | `/api/players/:id/profile` | KDA, dano/min, winrate por role, pódio |
| `POST` | `/api/draft/auto-balance` | **Sortear times** |
| `POST` | `/api/draft/captains/start` | Inicia o modo capitães |
| `POST` | `/api/draft/captains/pick` | Aplica uma escolha do snake draft |
| `GET` | `/api/series/current` | MD3 em andamento |
| `POST` | `/api/series` | Abre uma MD3 |
| `POST` | `/api/series/:id/matches` | Registra jogo (manual) |
| `GET` | `/api/series/:id/burned` | Campeões queimados (Fearless) |
| `GET` | `/api/stats/leaderboard` | Classificação geral |
| `POST` | `/api/riot/link` | Vincula Riot ID → PUUID |
| `POST` | `/api/riot/import` | Importa partida por Match ID |
| `POST` | `/api/ingest/lcu` | Recebe um custom game do agente local |
| `GET` | `/api/ingest/status` | Estado da MD3 e contagem de vínculos |

Todas respondem no envelope `{ success, data }` ou `{ success, error, code }`.

---

## Privacidade

**Este repositório é público.** Nomes reais, Riot IDs e PUUIDs dos jogadores
vivem **só no banco** (`dev.db`, que está no `.gitignore`) — nunca no `seed.ts`.
O seed usa apelidos genéricos de propósito.

O CI tem um passo que falha o build se encontrar uma chave `RGAPI-` no código ou
se o `.env` for versionado. Detalhes em [CONTRIBUTING.md](CONTRIBUTING.md).

O `lockfile` do cliente do LoL dá acesso total à conta de quem roda o agente.
Ele fica só em memória e nunca sai da máquina — só os dados da partida são
enviados.

## Notas de modelagem

- **Sem enum no schema.** O provider `sqlite` do Prisma não suporta `enum`;
  esses campos são `String`, validados na borda por zod. A fonte da verdade dos
  valores está em [`server/src/lib/roles.ts`](server/src/lib/roles.ts).
- **Sem modelo `Team`.** Os times mudam a cada jogo, então a composição vive em
  `MatchPlayerStat.teamSide`. Persistir times geraria centenas de registros de
  uma partida só.
- **`PlayerRole` em vez de um campo `mainRoles`.** A ordem de preferência é
  informação que o algoritmo usa, e uma tabela normalizada permite consultar
  "quem joga Support?" sem `LIKE` em string.
- **Placar da MD3 por elenco, não por cor.** Os campos `blueScore`/`redScore`
  guardam Time 1 / Time 2, ancorados no jogo 1. Mantive os nomes das colunas
  para não migrar um banco com dados reais dentro.
- **Jogador é desativado, nunca apagado** — deletar levaria junto todo o
  histórico de partidas dele e corromperia a classificação.

## Base inicial

O seed cadastra os **10 jogadores** do grupo. Ígor é jungler puro (pool de uma
role só), o que faz dele o gargalo mais apertado do elenco — e por isso o
algoritmo o aloca primeiro.

O sorteio recusa um elenco que não tenha exatamente 10, com mensagem explícita.
