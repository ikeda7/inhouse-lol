# Noite de jogos

O que fazer, na ordem, quando o grupo for jogar. Escrito para ser seguido com o
LoL aberto e pressa.

---

## Resposta curta

**Já existe integração ao vivo.** É o agente que roda no seu PC:

```bash
node companion/inhouse-companion.mjs --watch --api https://inhouse-lol.vercel.app/api
```

Deixe rodando a noite inteira. Ele vigia o cliente do LoL a cada 15 segundos e,
**quando cada jogo termina, manda o placar sozinho** — build, dano, visão,
bans, objetivos, tudo. Você não abre o site no meio da noite para nada.

O resto deste arquivo é o que fazer em volta disso.

---

## Antes de começar (uma vez, ~5 min)

### 1. Todo mundo precisa de Riot ID cadastrado

É o único passo manual que existe, e sem ele **a importação não sabe quem é
quem** no scoreboard.

Abra [Jogadores](https://inhouse-lol.vercel.app/jogadores). Quem estiver com o
selo laranja **"sem Riot ID"** não vai ser reconhecido. Clique no lápis e
preencha no formato `Nick#TAG`.

> O Riot ID **não** precisa da chave da Riot. O PUUID vem junto com os dados do
> jogo, e é ele que casa a pessoa com a linha do scoreboard.

Para conferir sem abrir o site:

```bash
node companion/inhouse-companion.mjs --who "Nick#TAG"
```

### 2. Node instalado

O agente é **zero-dependência** de propósito: só `node`, sem `npm install`.
Se `node --version` responde, está pronto.

### 3. Chegou alguém que nunca jogou

[Jogadores](https://inhouse-lol.vercel.app/jogadores) → **Novo jogador**:

- **Nome**: como a galera chama. Tem de ser único.
- **Riot ID**: `Nick#TAG`, exatamente como no cliente. Diz "opcional", mas
  numa noite de jogo **não é**: sem ele a partida chega e o servidor recusa
  com "participante(s) não estão vinculados", porque não sabe quem é quem.
- **Roles**: clique **na ordem de preferência** — a primeira vira a main, e é
  isso que o sorteio usa para decidir quem sai da main.

O selo **"sem conta"** ao lado do nome não atrapalha nada na noite: conta é
só para a pessoa pôr foto e entrar no próprio perfil. Quem quiser cria em
**Entrar → Criar conta**, e o histórico já vem junto.

### 4. A lista não fechou em 10

O sorteio e o draft exigem **exatamente 10** marcados.

- **Mais de 10:** marque só os 10 que vão jogar esta rodada. Reserva fica
  desmarcada e continua no cadastro.
- **Menos de 10:** o sorteio recusa em vez de montar time torto. Não tem modo
  4x5 — ou chega o décimo, ou a noite não conta para o ranking.
- **Trocou alguém no meio da MD3:** tudo bem. O placar da série segue o
  **elenco** (maioria dos 5), então uma substituição não quebra a contagem.

### 5. Chave do grupo

O site é público. Com a chave do grupo ligada, **só grava quem é do grupo**:
abrir MD3, cadastrar jogador, registrar partida e criar conta pedem a chave
(está no zap) ou uma conta logada. Ver tudo continua aberto.

- **No site:** na primeira vez, o próprio aviso de erro pede a chave. Digite
  uma vez e ela fica salva no navegador. Quem entrou na conta não precisa.
- **No agente:** defina a variável antes do `--watch`. Prefira a variável ao
  `--chave`, porque argumento fica no histórico do terminal.

```bash
# PowerShell
$env:INHOUSE_CHAVE = "a-chave-do-grupo"

# bash
export INHOUSE_CHAVE="a-chave-do-grupo"
```

---

## Na hora de jogar

### 1. Abra a MD3 no site

[Série](https://inhouse-lol.vercel.app/serie) → **Abrir nova MD3**.

**Isto é obrigatório e vem primeiro.** O agente recusa mandar partida quando não
há série em andamento — ele responde `NO_ONGOING_SERIES` e não grava nada. Não é
bug: é o que impede um custom aleatório de entrar no histórico do grupo.

> Abriu sem querer? Agora dá para descartar: a série sem nenhum jogo mostra um
> ícone de lixeira no Histórico. Série **com** jogo o servidor recusa apagar.

### 2. Sorteie os times

[Sorteio](https://inhouse-lol.vercel.app/sorteio) → marque os 10 → escolha:

| | |
|---|---|
| **Sorteio automático** | o algoritmo equilibra por rating e por pool de role |
| **Modo capitães** | draft 1-2-2-2-1, feito nesta tela. Os capitães saem por maior winrate, quem perdeu o último, aleatório, ou **Escolher**: você clica em quem tira o time (o primeiro fica com o azul) |
| **Draft ao vivo (com link)** | mesma coisa, mas com link para os dez acompanharem em tempo real |

Antes de clicar, olhe o painel **Cobertura de roles**. Se alguma estiver em
vermelho, o sorteio vai recusar a composição — falta gente para aquela role.
Amarelo passa, mas é o mínimo: ninguém sobra se alguém trocar.

### 3. Ligue o vigia e esqueça

Numa janela de terminal que **fique aberta a noite toda**:

```bash
node companion/inhouse-companion.mjs --watch --api https://inhouse-lol.vercel.app/api
```

Ele imprime o estado do cliente conforme muda (`Lobby`, `InProgress`,
`EndOfGame`) e envia cada partida ao terminar. `Ctrl+C` para sair.

**Quem roda:** qualquer um dos dez que jogou a partida — o histórico do cliente
é por conta. Não precisa ser quem hospedou. Se duas pessoas rodarem ao mesmo
tempo, tudo bem: a segunda tentativa é recusada como duplicada.

### 4. Fim da noite

[Série](https://inhouse-lol.vercel.app/serie) → **Encerrar**.

Isso fecha a MD3, define o vencedor pelo placar e libera o bônus de +1 ponto no
ranking para quem venceu.

---

## Se algo der errado

| O que aconteceu | O que fazer |
|---|---|
| `NO_ONGOING_SERIES` | Abra a MD3 no site. O agente não cria série sozinho. |
| Alguém entrou como "jogador provisório" | Faltou Riot ID. Preencha em Jogadores e rode `--refresh-all`. |
| Esqueceu de ligar o `--watch` | `--last` manda a última partida. Para várias: `--list` mostra os IDs, e `--games <id>,<id>` manda, na ordem em que foram jogadas. |
| Fechou o LoL antes de mandar | O histórico do cliente guarda ~100 partidas. Abra o LoL de novo e rode `--last`. |
| Desinstalou / o histórico sumiu | Se tiver o `.rofl` salvo: `--replays` lista, `--replay <arquivo>` manda. |
| Nada disso | Registro manual em Série → **Registrar jogo N**. É caminho de primeira classe, não gambiarra. |

Para ver o que ele mandaria sem gravar nada, acrescente `--dry-run` a qualquer
comando.

---

## Ensaio antes da noite (para quem mexe no código)

`client/e2e/ensaio-da-noite.mjs` percorre pela API o caminho inteiro de uma
noite: cadastro na hora, sorteio, sala de draft, MD3 com Fearless, lados
trocados, importação do LCU. O CI roda em todo PR. Para rodar na mão, sempre
num banco descartável — o script **grava** e recusa qualquer servidor que não
seja local:

```bash
cd server
DATABASE_URL=file:./ensaio.db npx prisma db push --skip-generate
DATABASE_URL=file:./ensaio.db npm run db:seed
DATABASE_URL=file:./ensaio.db PORT=3334 npx tsx src/index.ts
# em outro terminal, na raiz:
node client/e2e/ensaio-da-noite.mjs --base http://localhost:3334
```

---

## Sobre "ao vivo de verdade"

Vale separar três coisas que o nome "ao vivo" mistura:

**1. Draft ao vivo — já existe.** O botão *Draft ao vivo (com link)* no Sorteio
abre uma sala; o link mostra as escolhas acontecendo em tempo real para todo
mundo. Um link só: quem for capitão clica em "sou capitão" no próprio navegador.

**2. Partida importada assim que acaba — já existe.** É o `--watch`.
Aproximadamente 15 segundos depois do fim do jogo, o placar está no site.

**3. Placar mudando DURANTE a partida** — não existe, e é a única das três que
seria trabalho de verdade. O cliente do LoL expõe isso numa API separada
(`127.0.0.1:2999`), que só responde enquanto a partida roda e só para quem está
nela. Daria para fazer, mas seria um subsistema novo, e o valor é baixo: durante
a partida todo mundo está olhando o jogo, não o site.

**Minha recomendação:** fique com 1 e 2, que já estão prontos e cobrem a noite
inteira. Se depois de algumas noites o 3 fizer falta, aí sim vale abrir issue —
com o caso de uso concreto, não com a ideia.

---

## Referência rápida

```bash
# durante a noite (é esse que importa)
node companion/inhouse-companion.mjs --watch --api https://inhouse-lol.vercel.app/api

# mandar a última partida na mão
node companion/inhouse-companion.mjs --last --api https://inhouse-lol.vercel.app/api

# mandar várias: pegue os IDs no --list e passe na ordem em que foram jogadas
node companion/inhouse-companion.mjs --games <id>,<id> --api https://inhouse-lol.vercel.app/api

# ver o que faria, sem gravar
node companion/inhouse-companion.mjs --last --dry-run --api https://inhouse-lol.vercel.app/api

# listar o que o cliente conhece
node companion/inhouse-companion.mjs --list

# preencher colunas novas em partidas já gravadas
node companion/inhouse-companion.mjs --refresh-all --api https://inhouse-lol.vercel.app/api
```

Para não repetir a URL em todo comando:

```bash
# PowerShell
$env:INHOUSE_API_URL = "https://inhouse-lol.vercel.app/api"

# bash
export INHOUSE_API_URL="https://inhouse-lol.vercel.app/api"
```

---

## Por que o agente existe

A API pública da Riot **não lista custom game** —
`/lol/match/v5/matches/by-puuid/{puuid}/ids` só devolve fila oficial. Não é
limitação de chave nem de permissão: o endpoint não cobre o caso.

Quem conhece as partidas do grupo é o **cliente do LoL**, na máquina de quem
jogou. Por isso existe um agente local em vez de uma integração de servidor — e
por isso ele roda no seu PC, não na Vercel.

Detalhes em [ARCHITECTURE.md](ARCHITECTURE.md).
