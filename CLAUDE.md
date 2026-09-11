# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

InHouse LoL: manager for a friend group's weekly 5x5 League of Legends custom
games. Auto-balances teams by role pool, runs a Captains snake draft (with a
live-draft mode), enforces Fearless Draft across a Bo3, and tracks stats. Full
product description in [README.md](README.md); the reasoning behind every
non-obvious design decision is in [ARCHITECTURE.md](ARCHITECTURE.md) — **read
ARCHITECTURE.md before changing `lib/`, the DB schema, series/Fearless logic,
or the live-draft room.** [COMECE-AQUI.md](COMECE-AQUI.md) has the current
backlog/open decisions.

npm workspaces monorepo: `server/` (Express + TypeScript + Prisma), `client/`
(React 19 + Vite + Tailwind v4), `companion/` (a zero-dependency Node script
that runs on a player's own PC).

## Commands

```bash
npm install                          # installs both workspaces
cp .env.example .env                 # defaults work for local dev, no RIOT_API_KEY needed
npm run db:push                      # create local SQLite + generate Prisma Client
npm run db:seed                      # seed initial players
npm run dev                          # API on :3333, front on :5173 (concurrently)

npm test                             # both workspaces (server: vitest run, client: vitest run)
npm run test:server                  # server only
npm run test:client                  # client only
npm run typecheck                    # both workspaces (tsc --noEmit)
npm run build                        # server then client
npm run verificar:telas --workspace client -- --base http://localhost:3333   # screens in a real browser (see below)

npm run db:studio                    # Prisma Studio
npm run db:recompute                 # rebuild Series scores from Match rows (see below)
npm run db:recompute -- --dry-run    # preview only
npm run db:turso -- --schema-only    # push schema.prisma changes to the Turso prod DB
```

Single test file (run from repo root, or `cd server`/`cd client` first):
```bash
npx vitest run src/__tests__/autoBalance.test.ts --workspace server
# or, inside server/ or client/:
npx vitest run path/to/file.test.ts
npx vitest src/__tests__/autoBalance.test.ts   # watch mode
```

`server/vitest.config.ts` and `client/vitest.config.ts` both scope `include`
explicitly — vitest without it used to sweep `dist/` and silently run stale
build output. Don't remove that scoping.

### Screen check (CI job "Telas no navegador")

`client/e2e/verificar-telas.mjs` opens seven screens at 390/768/1024/1440px in
Chromium and fails on two things that typecheck, tests and build all pass:
horizontal scroll, and text below WCAG AA **after** compositing opacity and
backgrounds. That class of bug has shipped here repeatedly — text painted in
the background color, `opacity-40` on a whole row, a nav that overflowed every
tablet. No screenshot baseline on purpose: both checks are baseline-free.

- Needs the server serving the **built** client on one origin: run
  `npm run build --workspace client`, then start the server (`app.ts` serves
  `client/dist`). No Vite, no proxy, no CORS — same as production.
- `--preparar` **writes** fixture data (two extra players so the Sorteio has
  blocked rows, and a series with two matches). Only against a throwaway DB,
  as the CI job does with `DATABASE_URL=file:./ci.db`. Never against `dev.db`.
- `--telas sorteio,historico` runs a subset; an unknown name exits 2 instead
  of silently checking nothing.
- `CHROME_PATH` points at an existing Chromium instead of the one
  `npx playwright-core install chromium` downloads.

The job is **not** a required check yet. Promote it in branch protection once
it has proven stable across a few PRs.

### Game-night rehearsal (same CI job, before the screen check)

```bash
node client/e2e/ensaio-da-noite.mjs --base http://localhost:3334
```

Walks the whole night through the API, in order: register a late player,
draw teams (20 seeds), captains draft, live draft room (turn and version
locks), open a Fearless MD3, record games, a Fearless violation, a side swap
scored by roster, the auto-finish at 2 wins, discarding an empty series, and
the LCU import path the companion uses (dry run, idempotent resend,
`refreshStats`, unknown participant, no ongoing MD3). It also asserts the
public player list carries no `email`/`passwordHash`.

It **writes** data, so it refuses any non-local `--base`. Run it against a
throwaway DB (`DATABASE_URL=file:./ensaio.db` + `db push` + `db:seed`, server on
another `PORT`). It is re-runnable on the same DB — names carry a per-run
suffix and the synthetic PUUIDs are fixed per player. Run it before every
game night.

### Formatting

```bash
npm run format                       # prettier --write .
npm run format:check                 # what CI runs, inside the required "Testes, tipos e build" job
```

`prettier.config.js` describes the style the code already had — it was
**measured**, not picked: 100 columns, single quotes, `trailingComma: 'es5'`
(`all` or a wider width changed far more lines). Never run a bare `npx
prettier` without it being picked up: the defaults put double quotes in every
file. Markdown is excluded on purpose (`.prettierignore`) — the tables in the
docs are hand-aligned.

The one-time reformat commit is listed in `.git-blame-ignore-revs`, so blame
skips it. GitHub applies that automatically; locally run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

### Schema change checklist

```bash
# 1. edit server/prisma/schema.prisma
npm run db:push                      # apply locally
npm run db:turso -- --schema-only    # apply to Turso (prod)
# 2. after deploy, with the LoL client open:
node companion/inhouse-companion.mjs --refresh-all --api https://inhouse-lol.vercel.app/api
```
Skipping step 2 leaves new columns at zero on already-imported matches — no
error, just silent zeros in the UI. `migrate-to-turso.ts` diffs
`sqlite_master`'s stored `CREATE TABLE` against the schema and emits the
missing `ALTER TABLE ADD COLUMN`s (`prisma db push` doesn't work against
remote libSQL, and `PRAGMA table_info` doesn't parse there either).

### Git workflow

GitFlow, and **both `develop` and `main` are protected: direct pushes are
refused by the server**, admins included.

```
remote: error: GH006: Protected branch update failed for refs/heads/develop.
remote: - Changes must be made through a pull request.
```

Everything reaches them through a PR with green CI (both jobs — "Testes,
tipos e build" and "Segredos e dependências" — are required checks). Zero
approvals are required, because there is one maintainer and nobody approves
their own PR; the gate is the PR plus CI, not review.

Branch from `develop` as `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`,
`test/`; PR back into `develop`. Conventional Commits, body explains *why*
not *what*. Run `npm test && npm run typecheck && npm run build` before
opening a PR.

**Publishing is also a PR** — `git push origin main` no longer works:

```bash
gh pr create --base main --head develop --title "deploy: <what ships>"
gh pr merge --merge          # this is what deploys production
```

`develop` requires the branch to be up to date before merging; `main`
deliberately does not. `main` accumulates merge commits that never travel
back to `develop`, so with that rule on, `develop` would never count as up
to date and production would be permanently unmergeable.

Merging is the maintainer's call: open PRs, don't merge them unless asked.

## Architecture

### Layering (the rule that matters most)

```
lib/        pure TypeScript — zero Express, zero Prisma, zero React
services/   business rules — knows Prisma
routes/     HTTP — knows Express
```

`server/src/lib/` is the expensive, reverse-engineered part of this project
(the draft algorithm, the LCU/replay parsers) and is meant to survive a stack
migration unmodified. Never add a framework import to it.

| File | Purpose |
|---|---|
| `lib/autoBalance.ts` | Team draw: Hall's theorem feasibility check + MRV backtracking + cost-based restarts |
| `lib/captainsDraft.ts` | Snake draft, order `1-2-2-2-1` |
| `lib/lcu.ts` | Parses the LoL client's local match-history API (LCU) |
| `lib/rofl.ts` | Parses `.rofl` replay files (binary format found by reverse engineering) |
| `lib/riot.ts` | Public Riot API (only used for Match-ID/spectator import) |
| `lib/ddragon.ts` / `ddragonBuild.ts` | Data Dragon assets, items/spells/runes |
| `lib/auth.ts` | Password hashing (bcryptjs) and session JWT — pure, no Prisma |
| `lib/roles.ts` | Canonical roles — the source of truth since the schema has no `enum` (sqlite provider doesn't support it) |
| `services/series.ts` | Bo3 lifecycle, Fearless burns, match ingest/refresh |
| `services/stats.ts` | Leaderboard, player profile |
| `services/highlights.ts` | Records/highlights (`CATEGORIAS` table) |
| `services/draftRooms.ts` | Live-draft room state machine |
| `services/auth.ts` | Account claim, login, photo (LoL icon or upload) |
| `middleware/auth.ts` | `requireAuth` and the session-cookie options |

### One ingest pipeline, three sources

The public Riot API cannot list custom games at all (`/lol/match/v5/.../ids`
only returns ranked/normal queues) — this is the constraint that shapes the
whole import subsystem. All three input paths converge on one pipeline:

```
LCU (LoL client)   ─┐
Replay .rofl        ─┼→  mapLcuGame()  →  ingestGame()  →  DB
Manual form         ─┘
```

`.rofl` files are converted to the LCU shape before entering, so match
rules (PUUID auto-link, Fearless, idempotency) live in one place. The manual
form is a first-class path, not a fallback — it's the only path that needs no
LCU client and no API key.

`companion/inhouse-companion.mjs` is the local agent a player runs to push
their LCU/replay history to the API; it's dependency-free by design (plain
`node`, no npm install). `--refresh-all` re-sends already-imported games to
backfill new scoreboard columns without touching winner/series/Fearless state
— see `refreshMatchStats` in `services/series.ts`, guarded by
`assertMesmaPartida` (winner+roster must match) and a refusal to create new
matches during a refresh sweep.

### Two entrypoints, one Express app

`app.ts` builds and returns the Express app without calling `listen()`.
`index.ts` calls `listen()` (local/VPS/Docker); `api/index.ts` exports the
handler for Vercel's serverless runtime. Don't merge these — calling
`listen()` at import time would hang a serverless cold start.

### Data modeling decisions worth knowing before touching the schema

- No `Team` model — teams change every match; composition lives in
  `MatchPlayerStat.teamSide`.
- **MD3 score is tracked by roster, not by side.** Teams swap Blue/Red between
  games in a Bo3; counting by color would turn a 2-0 sweep into a 1-1. Team
  identity is anchored to Game 1's roster and matched by majority-of-5 overlap
  in later games (tolerates one substitution). Columns are still named
  `blueScore`/`redScore` for historical-data reasons — they mean Team A/Team B.
  If you change this rule or fix a historical match, rebuild everything with
  `npm run db:recompute`.
- `MatchBan` (draft-time ban) and `BurnedChampion` (Fearless-locked for the
  rest of the series) are deliberately separate — a champion can be banned in
  Game 2 without ever being played, and burned in Game 2 without ever being
  banned there.
- Objectives (dragon/baron/tower) live on `MatchTeamStat`, not `Match` —
  they're team-level facts, not player-attributable ones.
- Items are a CSV string on `MatchPlayerStat.items` (7 fixed slots) — not
  worth normalizing into a table. `null` means "source doesn't know the
  build" (e.g. `.rofl` has none); `0` means "empty slot." The UI distinguishes
  these on purpose.
- Player rows are deactivated, never deleted (deletion cascades and corrupts
  the leaderboard).
- Positions are often missing/duplicated in raw custom-game data; when the
  LCU/replay data doesn't resolve a full role assignment, remaining roles are
  filled from each player's declared pool and the response sets
  `rolesFullyInferred: false` so the UI can prompt for confirmation.

### Database

Same engine in dev and prod via the libSQL Prisma adapter: `server/prisma/dev.db`
file locally, Turso (hosted SQLite) in prod — same code path, only the URL
differs. `env.ts` resolves `DATABASE_URL="file:./dev.db"` to an absolute path
anchored at the schema, because the Prisma CLI and the libSQL client interpret
that relative path differently (CLI: relative to schema; libSQL: relative to
cwd) and would otherwise silently open two different files.

`Series` scores are denormalized (so listing series doesn't re-aggregate every
match) — `npm run db:recompute` is the mechanism for rebuilding that
denormalized state from the `Match`/`MatchPlayerStat` rows when it drifts.

### Live draft rooms

Deliberately polling, not SSE/WebSocket — prod runs on a serverless function
where long-lived connections get cut by the platform's duration limit. Clients
poll every ~2s, sending the last-seen `version`; the server replies `{
unchanged: true }` when nothing changed. A room's `version` column is also
the concurrency guard: a captain's pick includes the version it was read at,
and the write repeats that check in an `updateMany` so two simultaneous picks
can't silently overwrite each other. Player accounts exist now, but the room
still ignores them on purpose — "I'm the captain" just claims a per-browser
secret, which guards against accidental clicks by spectators, not against a
determined person. Wiring real identity into the draft is a pending decision,
not an oversight. Releasing the captain claim is
intentionally open to anyone, and an unclaimed side just drafts unrestricted.

### Player accounts (issue #3)

An account is **not** a separate user record — it is a claim on an existing
`Player`. Registration takes a `playerId` from `GET /api/auth/claimable`
(active players whose `passwordHash` is null) and fills in `email` and
`passwordHash`. The roster stays curated in the Jogadores tab, and an account
is born already attached to that person's match history. There is no
self-signup that creates a new `Player`.

Session is a JWT in an httpOnly cookie (`inhouse_session`); passwords use
bcryptjs (JS-only, so `npm install` needs no native toolchain on Windows).
`cors({credentials:true})` plus `cookie-parser` in `app.ts` are what let the
cookie survive the split origin in dev (front `:5173`, API `:3333`); in
production both are served from the same host. Login failures return one
generic message on purpose — it never reveals whether an e-mail exists.

Photos default to the LoL summoner icon, and that needs **no Riot key**: the
LCU payload carries each participant's `profileIcon`, and the ingest
(`guardarIcones`) stores it on every known player, setting it as the photo
for anyone whose `photoSource` is `NONE` or `LOL_ICON` — an uploaded photo is
never replaced. `--refresh-all` backfills icons for matches imported before
this. "Usar ícone do LoL" uses Summoner-V4 when a key exists and falls back
to the stored icon otherwise. An uploaded photo is stored **as a `data:` URI in
`Player.photoUrl`** — no multer, no disk, no object storage, because the
serverless filesystem is ephemeral (the same reason production runs on Turso
instead of a file). The browser resizes to 256px JPEG before POSTing; the
server rejects anything over 300 KB and any type outside jpeg/png/webp (SVG
is refused deliberately — it can carry script).

### Write protection (group key)

The site and the repo are public, and most routes need no login. With
`GROUP_KEY` set, **every write** under `/api` requires a valid session **or**
the header `x-chave-do-grupo` matching the key — including `/auth/register`,
which is what stops a stranger from claiming a friend's player.
`exigirGrupo` (`middleware/auth.ts`) is mounted on `/api` before every router,
so a new write route is protected by default; the few exceptions (login and
logout, the stateless draft calculators, picks inside a live room) live in
`lib/escritas.ts` with the reason next to each. Reads stay public.

Without `GROUP_KEY` the check is skipped (fail-open), so a deploy can't lock
the site before the variable exists; production logs a warning and
`/api/health` reports `grupoProtegido`. The client sends the key from
localStorage and `ErrorState` asks for it on `GROUP_KEY_REQUIRED`; the
companion reads `INHOUSE_CHAVE`.

Sessions are bound to the password: the JWT carries
`v = sha256(passwordHash)[:16]` and `validarSessao` checks it against the DB
on every authenticated request. Changing the password — or releasing a
wrongly claimed account with
`npm run conta:liberar --workspace server -- "Nome" --confirmar` — kills
every open session. Tokens without `v` (issued before this) are rejected.

Login (10 per 15 min) and register (5 per hour) are rate-limited per IP in
memory (`lib/limite.ts`): a burst brake, not a vault, because serverless
instances don't share memory. `trust proxy` is on only under Vercel, so
`req.ip` is the real client there and not the proxy.

### Frontend

- Design tokens are layered (`canvas → surface → raised → overlay`); gold is an
  accent only, never body text; blue/red are reserved for team identity.
  Token values live in `client/src/index.css` **and** are duplicated as
  constants in `client/src/lib/imagem/canvas.ts` (canvas rendering can't read
  CSS custom properties) — keep both in sync when changing colors. That module
  is the shared base of every exported image (ranking, match, series,
  highlights: brand, footer, icons, copy/download/share); `ExportarImagem` is
  the button set for all of them.
  Text-contrast tokens must stay WCAG AA against the lightest surface they
  render on; measure, don't eyeball (see the `ink-muted`/`ink-faint` incident
  in ARCHITECTURE.md).
  - `Select` is a custom component, not `<select>` — the native menu doesn't
  accept styling on Windows.
- Match history is three levels deep behind clicks (series → game → player);
  the player level exists specifically so post-game stats don't require the
  LoL client to still be open.
- Any big stat number is paired with a bar showing it relative to the best in
  the match — a number is only meaningful next to a max.
- Data Dragon champion/item/spell/rune catalogs are fetched once and cached in
  a module-level map (`useBuild`), not searched with `.find()` per render —
  ~870 items, only the match-history views need them, so they're on a
  separate route from the champion list the draft/ranking screens use.

## Non-obvious repo constraints

- **`RIOT_API_KEY` is optional.** The primary import path (LCU) needs no key;
  the key only matters for Match-ID/spectator import, and dev keys expire
  every 24h.
- **Set `GROUP_KEY` in production.** Without it every write is open to any
  visitor (see "Write protection" above). It is optional only so a deploy
  never locks the site before the variable exists.
- **`JWT_SECRET` is required only when `NODE_ENV=production`.** Elsewhere it
  falls back to a constant, so CI and a fresh clone run with no `.env` at
  all. On Vercel `NODE_ENV` *is* production, so the variable must exist there
  — `env.ts` throws at import, which takes down the whole API, not just the
  account routes.
- **This repo is public.** Real names, Riot IDs, and PUUIDs live only in the
  DB (`dev.db`, gitignored) — never in `seed.ts` (uses generic nicknames). CI
  fails the build on a committed `RGAPI-` key or a committed `.env`.
- No `enum` in `schema.prisma` — the sqlite provider doesn't support it;
  those fields are `String`, validated at the edge with zod, source of truth
  in `lib/roles.ts`.
- Valid match filter is `mapId === 11 && gameMode === CLASSIC` (Summoner's
  Rift 5x5) — not player count, since ARAM has no lanes and would poison
  per-role/per-minute stats.
