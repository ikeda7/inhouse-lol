# Como contribuir

Projeto de uso interno de um grupo de amigos, mas o código é público. Estas são
as regras que valem aqui.

## Fluxo de branches

GitFlow simplificado. `develop` e `main` são protegidas: nada entra direto nelas.

```bash
git checkout develop
git pull origin develop
git checkout -b feat/nome-curto
```

Prefixos: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`.

O código volta para `develop` por Pull Request. O CI precisa estar verde.
Publicar também é PR: `develop` → `main`, e o merge em `main` é o que faz o
deploy de produção na Vercel. Push em `develop` gera só *preview*: se a mudança
não aparece no site, provavelmente ela ainda está só em `develop`.

### As duas branches são protegidas

`git push origin develop` e `git push origin main` são recusados pelo GitHub,
inclusive para admin.

| Regra | Por quê |
|---|---|
| PR obrigatório, **0 aprovações** | força o fluxo sem travar quem trabalha sozinho (não dá para aprovar o próprio PR) |
| CI obrigatório (testes + segredos) | nada entra vermelho |
| Vale para admin | sem isso a proteção não protegeria justamente de quem mais empurra código |
| Sem force push, sem apagar branch | o histórico de `main` é o que está no ar |

`develop` exige a branch atualizada antes do merge; `main` não, porque acumula
commits de merge que nunca voltam para `develop`, e a regra travaria o deploy
para sempre.

**Emergência.** Dá para suspender a proteção pelo painel (*Settings → Branches*)
ou com `gh api -X DELETE repos/ikeda7/inhouse-lol/branches/main/protection`,
publicar e religar. É de propósito que não exista atalho silencioso: desligar a
proteção fica no histórico do repositório, e um push direto não ficaria.

## Mensagens de commit

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat: sorteia times respeitando o pool de roles
fix: conta o placar da MD3 por elenco, não por cor
```

O corpo explica **por quê**, não o quê — o diff já mostra o quê. Se a mudança
corrige um comportamento observado na prática, cite o caso real.

## Antes de abrir o PR

```bash
npm test           # 131 testes (101 no back, 30 no front)
npm run typecheck  # os dois workspaces
npm run build
```

## O que este repositório NÃO pode conter

O repositório é **público**. Nunca commite:

- **Chave da Riot API** (`RGAPI-...`) — o CI falha se encontrar
- **`.env`** — está no `.gitignore`, mantenha assim
- **`dev.db`** — contém nomes reais, Riot IDs e PUUIDs dos jogadores
- **`lockfile` do cliente do LoL** — dá acesso total à conta de quem rodou

Dados pessoais do grupo (nomes reais, Riot IDs) vivem **só no banco**, nunca no
`seed.ts`. O seed usa apelidos genéricos de propósito.

## Estilo

- TypeScript estrito; evite `any` — use `unknown` e estreite o tipo
- Comentário explica **decisão**, não mecânica. Se o código já diz o que faz,
  o comentário deve dizer por que foi feito assim
- Funções focadas, arquivos coesos
- Erro tratado explicitamente; nada de `catch {}` silencioso

## Testes

Todo comportamento que veio de um bug real merece um teste que o descreva.
Veja `seriesStanding.test.ts` — o nome do teste conta o caso que quebrou.
