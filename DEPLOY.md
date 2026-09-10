# Deploy

O que precisa de você, passo a passo. **Tudo grátis.**

O código já está pronto e testado — o que falta são as duas contas, porque
login não dá pra automatizar.

---

## Por que não dá só Vercel

Confirmado na documentação da própria Vercel:

> "Vercel functions have a **read-only filesystem** with writable `/tmp` scratch
> space." — *e sobre escrever arquivos*: "we recommend persisting to object
> storage."

O que engana: **o deploy funciona**. Builda, serve, abre. O que não funciona é
o banco persistir — as escritas vão pro `/tmp`, sobrevivem enquanto aquela
instância está quente, e somem **sem erro nenhum**. Você só descobre quando o
histórico de partidas sumiu.

Por isso o banco vai pro **Turso**: é SQLite hospedado, então continua sendo o
mesmo motor que roda na sua máquina. Trocar de banco entre dev e produção é a
origem clássica de "na minha máquina funciona", porque tipo, ordenação e
concorrência divergem em silêncio.

---

## Passo 1 — Turso (o banco)

1. Entre em <https://turso.tech> e crie a conta (login com GitHub serve).
2. Crie um banco. Nome sugerido: `inhouse-lol`. Região: escolha a mais perto do
   Brasil que aparecer.
3. Na página do banco, pegue **duas coisas**:
   - a **URL**, que começa com `libsql://`
   - um **token de acesso** (procure por *Create Token* / *Generate Token*)

Me mande as duas assim:

```
DATABASE_URL="libsql://inhouse-lol-seu-usuario.turso.io"
DATABASE_AUTH_TOKEN="ey..."
```

> **O token dá acesso de escrita ao banco.** Mande por mensagem direta, não
> comite em lugar nenhum e não cole em issue. Se vazar, dá pra revogar e gerar
> outro na mesma tela.

**Com isso eu faço**, sem você precisar de mais nada: aplico o schema no Turso e
migro as 4 partidas que já estão no banco local.

---

## Passo 2 — Vercel (o app)

1. Entre em <https://vercel.com> e crie a conta **com o GitHub** — assim ela já
   enxerga o repositório.
2. **Add New → Project** → escolha `ikeda7/inhouse-lol` → **Import**.
3. Na tela de configuração, mexa em duas coisas:

   **Branch de produção:** `develop`
   *(o padrão dela é `main`; nosso fluxo integra em `develop`)*

   **Environment Variables** — as duas do passo 1 e mais duas de segurança:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `libsql://...` |
   | `DATABASE_AUTH_TOKEN` | `ey...` |
   | `JWT_SECRET` | `openssl rand -hex 32` — sem ela a API nem sobe em produção |
   | `GROUP_KEY` | a chave do grupo (`openssl rand -hex 12`) — sem ela, qualquer visitante grava e reivindica conta |

   A `GROUP_KEY` é a mesma que vai no zap e no `INHOUSE_CHAVE` do agente.
   Depois de salvar, faça um **Redeploy** e confira em `/api/health` que
   aparece `"grupoProtegido": true`.

   O resto (build command, output directory) já vem do
   [`vercel.json`](vercel.json) — não precisa preencher.

4. **Deploy**.

Se der erro no build, me mande o log que eu resolvo.

---

## Passo 3 — depois que subir

Me diga a URL. Eu confiro se a API responde, se o banco está ligado e se o
ranking aparece com os dados certos.

Aí você:

- **Manda o link pro grupo** — mas leia o aviso de segurança abaixo antes
- **Aponta o agente pra lá:**

```bash
node companion/inhouse-companion.mjs --watch --api https://SEU-APP.vercel.app/api
```

---

## Aviso de segurança, antes de divulgar

**O app não tem autenticação.** Quem tiver o link cadastra jogador, registra
partida e encerra MD3. E ele contém nomes reais e Riot IDs do grupo.

Para um link não divulgado entre 10 amigos costuma bastar, mas é uma decisão
consciente — não um esquecimento. A [issue #3](https://github.com/ikeda7/inhouse-lol/issues/3)
cobre contas com login e foto de perfil, que resolve isso de vez.

Se quiser proteger antes disso, o caminho mais rápido é pôr o app atrás do
**Cloudflare Access** (grátis para poucos usuários), sem tocar no código.

---

## Domínio próprio (quando comprar)

Na Vercel: **Settings → Domains → Add**. Ela dá os registros DNS para apontar no
registrador. HTTPS é automático e incluso no plano grátis.

---

## Se um dia sair da Vercel

Nada disso vira lixo:

| Destino | O que muda |
|---|---|
| **VPS** (~R$25/mês) | `Dockerfile` já pronto. O SQLite pode voltar a ser arquivo e o Turso vira opcional. |
| **Fly.io** | `fly.toml` já pronto, com volume persistente. |
| Continuar na Vercel | Nada. |

A separação entre `createApp()` e `listen()` existe justamente para isso: o
mesmo app serve serverless e processo próprio, sem fork de código.

---

## Custos

| | Plano | Limite relevante |
|---|---|---|
| Turso | grátis | 500 bancos, 9 GB, 1 bilhão de leituras/mês |
| Vercel | Hobby (grátis) | uso não-comercial, domínio próprio incluso |

Uma noite de jogos por semana com 10 pessoas não chega perto de nenhum teto.
