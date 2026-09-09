# Como contribuir

Projeto de uso interno de um grupo de amigos, mas o código é público. Estas são
as regras que valem aqui.

## Fluxo de branches

GitFlow simplificado. `main` é protegida — nada entra direto nela.

```bash
git checkout develop
git pull origin develop
git checkout -b feat/nome-curto
```

Prefixos: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`.

O código volta para `develop` por Pull Request. O CI precisa estar verde.

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
