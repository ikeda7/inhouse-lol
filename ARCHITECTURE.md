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
| `captainsDraft.ts` | Snake draft 1-2-2-2-2-1 |
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

---

## Frontend

**Tokens em camadas**, não borda em tudo:

```
base → surface → raised → overlay
```

Hierarquia vem de escala e espaço. O dourado é **acento**, nunca texto corrido.
Azul e vermelho identificam **só** time.

**`Select` próprio** porque o nativo não aceita estilo no menu — no Windows abre
a lista branca do sistema no meio de uma interface escura. O componente
reimplementa o que o nativo dava de graça: setas, Home/End, Escape, busca por
digitação, `aria-activedescendant` e devolução de foco.

**Duas apresentações do ranking:** tabela no desktop, cartão no celular. Oito
colunas viravam rolagem horizontal.

**Opção bloqueada continua visível** e marcada com o motivo. Esconder faz a
pessoa procurar um nome que sumiu — e o motivo é a informação que ela precisa.

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
