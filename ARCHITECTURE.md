# Arquitetura

Para quem vai mexer no código. O README explica o que o app faz; aqui está
**por que ele é assim**.

---

## Mapa

```
inhouse-lol/
├─ api/index.ts            handler serverless (Vercel)
├─ companion/              agente que roda no PC de quem jogou
├─ server/
│  ├─ prisma/schema.prisma
│  ├─ scripts/             manutenção (recalcular placares)
│  └─ src/
│     ├─ app.ts            monta o Express (sem escutar porta)
│     ├─ index.ts          escuta porta — local, VPS, Docker
│     ├─ lib/              ← lógica pura, sem framework
│     ├─ services/         regras de negócio
│     └─ routes/           HTTP
└─ client/src/
   ├─ pages/  components/  hooks/  api/
```

## A divisão que mais importa

```
lib/            ← TypeScript puro. Zero Express, zero Prisma, zero React.
services/       ← regras de negócio. Conhece Prisma.
routes/         ← HTTP. Conhece Express.
```

**`lib/` é o que este projeto tem de valioso** e é a parte mais cara de
reescrever:

| Arquivo | O que resolve |
|---|---|
| `autoBalance.ts` | Sorteio de times. Hall + MRV + restarts. 14 testes. |
| `lcu.ts` | Parser do histórico do cliente do LoL |
| `rofl.ts` | Parser de replay (formato descoberto por engenharia reversa) |
| `captainsDraft.ts` | Snake draft 1-2-2-2-1 |
| `ddragonBuild.ts` | Itens, feiticos e runas |
| `roles.ts` | Roles canônicas e normalização |
| `ddragon.ts` | Assets oficiais |

Nada disso importa framework. **Numa eventual migração para Nest, esses
arquivos vão inteiros, sem alteração.** Uma migração que os preserve é barata;
uma que os reescreva joga fora descoberta que custou tempo real.

---

## Duas entradas, um app

```
app.ts  →  createApp()  monta e devolve, sem listen()
             ├─ index.ts       chama listen()      → local, VPS, Docker
             └─ api/index.ts   exporta o handler   → Vercel
```

Serverless **importa** o handler e chama por requisição — não existe `listen()`.
Se o módulo escutasse porta no import, o deploy subiria e travaria. Separar
evita um fork do código só por causa do destino.

### Fallback do SPA na Vercel

O `vercel.json` tem dois rewrites. O segundo manda tudo que **não** começa com
`/api` para o `index.html`: sem ele, dar F5 em `/jogadores/123` cai no 404 da
plataforma, porque não existe arquivo com esse nome e quem conhece a rota é o
React Router, que só roda depois do HTML carregar.

Rewrites são avaliados **depois** da checagem de arquivo estático, então
`/assets/*.js` continua sendo servido pela CDN normalmente.

---

## Três caminhos de importação, um de gravação

A API pública da Riot **não lista custom games** —
`/lol/match/v5/matches/by-puuid/{puuid}/ids` só devolve filas oficiais. Isso é
a restrição central do projeto e explica a maior parte do desenho.

```
LCU (cliente do LoL)  ─┐
Replay .rofl          ─┼→  mapLcuGame()  →  ingestGame()  →  banco
Formulário manual     ─┘
```

O `.rofl` é convertido para o **mesmo shape do LCU** antes de entrar. Assim toda
a regra (casamento por PUUID, auto-vínculo, Fearless, idempotência) vive num
lugar só, em vez de duplicada por origem.

### Onde cada um serve

| Caminho | Alcance | Precisa de |
|---|---|---|
| LCU | ~100 partidas / ~1 mês | cliente aberto |
| Replay | ilimitado | o `.rofl` salvo |
| Manual | qualquer | nada |

O manual **não é plano B improvisado**: como a API pública não cobre o caso de
uso, ele é caminho de primeira classe.

### Detalhes que custaram descoberta

- **Dois endpoints de histórico no LCU.** `current-summoner` devolve 20 e ignora
  paginação; `{puuid}/matches` devolve ~100. Usar o primeiro faz parecer que
  partidas antigas sumiram.
- **O `.rofl` mudou de formato** (magic `RIOT\x02`). Os offsets do header
  clássico devolvem lixo. O bloco JSON é localizado por varredura, o que
  sobrevive a mudança de header entre patches.
- **A posição quase nunca vem preenchida** em custom game. Quando falta, as
  roles restantes são distribuídas pelo **pool declarado** dos jogadores, e a
  resposta sinaliza `rolesFullyInferred: false` para a tela pedir conferência.

---

## Decisões de modelagem

**Sem `enum`.** O provider `sqlite` do Prisma não suporta. Os campos são
`String`, validados por zod na borda. A fonte da verdade está em `lib/roles.ts`.

**Sem modelo `Team`.** Os times mudam a cada jogo; persistir geraria centenas de
registros de uma partida só. A composição vive em `MatchPlayerStat.teamSide`.

**`PlayerRole` normalizado** em vez de um campo CSV: a **ordem** de preferência
é dado que o algoritmo usa, e permite consultar "quem joga Support?" sem `LIKE`.

**Jogador é desativado, nunca apagado.** Deletar levaria o histórico junto
(`onDelete: Cascade`) e corromperia a classificação.

**Placar da MD3 por elenco, não por cor.** Em custom os times trocam de lado
entre jogos. Contar por BLUE/RED transformava um 2-0 em 1-1. A identidade de um
time é o conjunto de jogadores, ancorado no jogo 1, com maioria de 5 —
tolera uma substituição. Os campos `blueScore`/`redScore` guardam Time A / Time
B; mantive os nomes das colunas para não migrar um banco com dados reais dentro.

**Objetivos em `MatchTeamStat`, não em `Match`.** Dragão, barão e torre são dado
de **time**, não de jogador — dragão não pertence a quem deu o last hit. Poderiam
ser colunas `blueDragons`/`redDragons` no `Match`, mas em tabela separada a
consulta e a UI tratam os dois lados pelo mesmo caminho, em vez de escolher
coluna por `if (side === 'BLUE')`.

**Ban não é campeão queimado.** `MatchBan` e `BurnedChampion` parecem redundantes
e não são: **ban** é escolha de quem draftou naquele jogo; **queimado** é
consequência de ter sido usado, e vale para o resto da MD3 (Fearless). Um
campeão pode ser banido no jogo 2 sem nunca ter sido jogado, e queimado no 2 sem
nunca ter sido banido.

**Itens em CSV, não em tabela.** Os 7 slots são posição fixa, não entidade:
normalizar sete inteiros ordenados não compra consulta nenhuma. Ficam como
`"3084,1056,0,..."` em `MatchPlayerStat.items`.

**`null` e `0` querem dizer coisas diferentes na build.** Zero é *slot vazio* —
o cara terminou o jogo com 4 itens. `null` é *a origem não sabe* — o `.rofl` não
guarda build. A tela mostra quadrado vazio no primeiro caso e "build
indisponível" no segundo, e confundir os dois seria mentir sobre o que aconteceu.

---

## Banco

O **mesmo motor** em dev e produção, via adapter libSQL:

```
desenvolvimento  →  arquivo local (server/prisma/dev.db)
produção         →  Turso (SQLite hospedado)
```

O adapter é usado **nos dois**, inclusive local. Assim o caminho exercitado em
desenvolvimento é o de produção; só a URL muda.

> **Pegadinha resolvida:** `DATABASE_URL="file:./dev.db"` significa coisas
> diferentes para o Prisma CLI (relativo ao schema) e para o cliente libSQL
> (relativo ao cwd). A mesma URL abria dois arquivos. `env.ts` resolve para
> caminho absoluto ancorado no schema.

O placar fica **denormalizado** em `Series` para o histórico não agregar tudo a
cada listagem. Denormalização precisa de um jeito de reconstruir a verdade:
`npm run db:recompute`.

### Migração para o Turso

`prisma db push` fala com arquivo SQLite, não com libSQL remoto. O caminho
suportado é gerar o SQL a partir do schema (`prisma migrate diff`) e executá-lo
pelo cliente libSQL — é o que `scripts/migrate-to-turso.ts` faz.

> **Pegadinha resolvida:** `CREATE TABLE IF NOT EXISTS` **não é migração.** Num
> banco que já tem as tabelas ele não faz nada, e uma coluna nova do schema nunca
> chega no destino — em silêncio, que é o pior jeito de falhar. O script agora lê
> o `CREATE TABLE` que o próprio SQLite guardou em `sqlite_master`, compara com o
> que o schema espera e emite os `ALTER TABLE ADD COLUMN` que faltam.
>
> Foi preciso usar `sqlite_master` porque **`PRAGMA table_info` não passa no
> parser do libSQL** (`SQL_PARSE_ERROR: near LP`).

> **Pegadinha irmã, encontrada ao publicar as contas:** o índice tem que vir
> **depois** da coluna. O `prisma migrate diff` devolve `CREATE TABLE` e
> `CREATE INDEX` numa lista só, e aplicá-la inteira antes do passo de
> `ALTER TABLE` quebra na primeira coluna nova que tenha `@unique`:
>
> ```
> CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email")
> -> SQL_INPUT_ERROR: no such column: "email"
> ```
>
> E como isso acontecia antes de qualquer `ALTER TABLE`, o script morria sem
> aplicar **nenhuma** coluna. O destino ficava intacto, o que salvou o banco,
> mas o deploy simplesmente não acontecia. Agora a ordem é: tabelas → colunas
> que faltam → índices.

Rodar sem flag copia dados de local → Turso e **recusa sobrescrever** sem
`--force`. Para só mexer na estrutura: `npm run db:turso -- --schema-only`.

---

## Reescrever a scoreboard sem apagar a partida

Dado de custom game só existe na máquina de quem jogou, e só enquanto o cliente
ainda tem a partida em cache. Isso cria um problema: quando o schema cresce, as
partidas antigas ficam com zero em colunas que a origem sempre soube responder.

Apagar e reimportar resolveria o número e destruiria o resto — placar da MD3,
campeões queimados, número do jogo. Então existe `refreshMatchStats`, exposto
como `refreshStats` na ingestão e `--refresh` / `--refresh-all` no agente:

```
reenvia o mesmo jogo  →  reescreve SÓ a scoreboard
                          (jogadores, times, bans, patch, rendição)
                      →  não toca em vencedor, número do jogo, série, Fearless
```

Duas guardas, porque essa é a única operação do projeto que **sobrescreve dado
real**:

- **`assertMesmaPartida`** — vencedor e elenco têm que bater. Um `riotMatchId`
  reaproveitado ou um `--series` apontado errado gravaria os números de um jogo
  em cima de outro. Divergência aborta, não "corrige". Tem teste próprio.
- **Não cria partida nova.** Com `refreshStats` ligado e a partida ausente, a
  rota **pula**. Sem isso, varrer o histórico para consertar as registradas
  importaria de carona todo custom antigo que aparecesse — e todos cairiam na
  MD3 em andamento, que não tem nada a ver com eles.

A checagem de idempotência acontece **antes** de procurar a série de destino:
partida que já existe pertence a uma série, e exigir uma MD3 aberta para
atualizar a scoreboard dela não faz sentido.

---

## Draft ao vivo: consulta, não evento

O modo Capitães normal guarda o estado no **cliente** — cada escolha manda o
estado inteiro e recebe o próximo. É simples, sobrevive a F5 e não precisa de
tabela. Mas o estado é de uma pessoa: ninguém mais vê o draft acontecendo.

A sala move esse estado para o banco, sob um código curto que vira link.

**Por que consulta e não SSE.** O caminho canônico seria SSE ou WebSocket. Não
serve aqui: a produção roda em função serverless, onde conexão longa é cortada
pelo limite de duração e não existe processo vivo para segurar assinatura.
Consultar de 2 em 2 segundos é feio no papel e funciona hoje, no plano grátis.

Três coisas tornam isso barato o bastante: a consulta manda a versão que já tem
e recebe `{ unchanged: true }` quando nada mudou; para quando a aba sai da
frente; e para quando o draft fecha.

**A coluna `version` faz dois trabalhos.** Além de dizer ao cliente se mudou
algo, ela impede escolha dupla. Os dois capitães podem clicar no mesmo segundo,
e sem isso a segunda gravação sobrescreveria a primeira — o jogador escolhido
pelo primeiro voltaria para o pote sem ninguém entender por quê. A escolha manda
a versão que viu, e a gravação **repete essa condição no `updateMany`**: entre
ler e escrever ainda cabe outra requisição, então quem decide a ordem é o banco.

**A trava de capitão é contra acidente, não contra gente.** Não há login: cada
capitão clica "Sou o capitão" e recebe um segredo que fica no navegador dele.
Isso impede que quem está assistindo clique num jogador sem querer — e nada
além disso. Daí duas decisões que parecem frouxas e são deliberadas:

- **liberar é aberto a qualquer um.** Num grupo de amigos, o capitão ficar sem
  bateria é muito mais provável que sabotagem, e ficar travado seria pior que o
  problema que a trava resolve.
- **lado sem dono continua aberto.** Se ninguém clicar, o draft funciona como
  antes, em vez de travar esperando alguém se identificar.

Sala expira em 12h e some da API; as vencidas são varridas ao abrir uma sala
nova, porque não existe cron aqui e é o único momento em que alguém se importa.

---

## Frontend

**Tokens em camadas**, não borda em tudo:

```
base → surface → raised → overlay
```

Hierarquia vem de escala e espaço. O dourado é **acento**, nunca texto corrido.
Azul e vermelho identificam **só** time.

**Os três níveis de texto passam WCAG AA no fundo mais claro em que aparecem.**
Isso não era verdade até 09/09: `ink-faint` era `#5c6b85`, que dá **2.86:1** no
overlay — e era justamente o token usado nos textos de 10-11px, onde mais
precisa de contraste. Arrumar só ele o deixava colado no `ink-muted` e a
hierarquia sumia, então os dois subiram juntos:

| token | antes | depois | pior caso |
|---|---|---|---|
| `ink-muted` | `#93a3bd` | `#aab8cd` | 7.67:1 |
| `ink-faint` | `#5c6b85` | `#7d8da8` | 4.59:1 |

Ao mexer em cor, **meça** antes de decidir — o cálculo é rápido e a intuição
erra em fundo escuro. Foi assim que o bronze do pódio (`amber-700`, 3.40:1)
apareceu como problema junto.

Duas coisas repetem esses valores e precisam andar juntas: os tokens em
`index.css` e as constantes em `lib/rankingImage.ts` — canvas não lê custom
property do CSS.

**`Select` próprio** porque o nativo não aceita estilo no menu — no Windows abre
a lista branca do sistema no meio de uma interface escura. O componente
reimplementa o que o nativo dava de graça: setas, Home/End, Escape, busca por
digitação, `aria-activedescendant` e devolução de foco.

**Duas apresentações do ranking:** tabela no desktop, cartão no celular. Oito
colunas viravam rolagem horizontal.

**Opção bloqueada continua visível** e marcada com o motivo. Esconder faz a
pessoa procurar um nome que sumiu — e o motivo é a informação que ela precisa.

**Histórico em três níveis**, cada um atrás de um clique: série → jogo →
jogador. Tudo aberto de uma vez seriam ~40 blocos de números na mesma tela.

**Número grande sempre com barra de comparação.** No detalhe do jogador, cada
métrica vem com uma barra do tamanho relativo ao melhor da partida, e fica
dourada quando é o melhor. "37k de dano" não diz nada sozinho; 37k *sendo o
maior da partida* diz tudo. É o que transforma número em informação.

**Manifesto do Data Dragon em Map, não em lista.** `/riot/build` traz ~870
itens; uma scoreboard aberta resolve 70 ícones. Com `.find()` numa lista, cada
render viraria dezenas de milhares de comparações. `useBuild` indexa uma vez, na
primeira carga, e cacheia em módulo — uma requisição por sessão.

**Itens, feitiços e runas vêm em rota separada** de campeões. São ~870 entradas e
só o histórico precisa: quem abre o ranking não paga por isso. Os três catálogos
vêm em paralelo com `allSettled` — se só o de runas cair, item e feitiço ainda
aparecem. Ícone faltando é melhor que scoreboard vazia.

---

## Testes

53, concentrados onde o custo de errar é alto:

| Suíte | Cobre |
|---|---|
| `autoBalance` | invariantes do sorteio, 200 seeds, viabilidade, desempenho |
| `lcu` | formato real do cliente, mapa/modo, resolução de posição |
| `rofl` | header binário, statsJson, integração com o mapper |
| `seriesStanding` | troca de lado entre jogos (o bug real) |

Testes que nasceram de bug real levam o caso no nome. `seriesStanding.test.ts`
descreve a MD3 de 07/09/2026 que quebrou.

**O front não tem testes** ainda — [issue #10](https://github.com/ikeda7/inhouse-lol/issues/10).

---

## Onde mexer para cada coisa

| Tarefa | Arquivo |
|---|---|
| Mudar o sorteio | `lib/autoBalance.ts` |
| Mudar a pontuação | `services/stats.ts` |
| Mudar regra da MD3 | `services/series.ts` |
| Novo endpoint | `routes/` + registrar em `app.ts` |
| Novo campo no banco | `prisma/schema.prisma` → `npm run db:push` |
| Cor, espaçamento, fonte | `client/src/index.css` (tokens) |
| Comando do agente | `companion/inhouse-companion.mjs` |
| Regra do draft ao vivo | `services/draftRooms.ts` |
| Cor, contraste | `client/src/index.css` **e** `lib/rankingImage.ts` |
| Novo destaque ou recorde | `services/highlights.ts` (tabela `CATEGORIAS`) |
| Novo campo no scoreboard | `lib/lcu.ts` → `colunasDeScoreboard` em `services/series.ts` → schema |
| Levar coluna nova pro Turso | `npm run db:turso -- --schema-only` |
| Preencher coluna nova nas partidas antigas | `--refresh-all` no agente, com o cliente aberto |
