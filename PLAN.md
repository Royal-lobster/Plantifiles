# Plantifiles — v1 Build Plan

Agent-native plan documents. A dev's coding agent publishes a plan, the team reviews it in the browser, and any coding agent pulls the approved version back as clean Markdown to build from.

This document is the complete v1 spec. Every decision below is settled — implement it, don't relitigate it. Where a detail is genuinely unspecified, pick the boring option and note it in `DECISIONS.md`.

## The loop v1 must close

```mermaid
graph LR
  A[agent session] -->|plantifiles push| B[plan v1]
  B --> C[review: comments, decisions, approvals]
  C -->|structural diff| D[plan vN]
  D -->|approve| E[Ready to Build]
  E -->|GET plan URL as markdown| F[agent builds]
```

A v1 that cannot demonstrate that full circle end to end is not done, regardless of how much UI exists.

## Stack

Settled, and the pins below are deliberate. Do not substitute, and do not float anything to `latest`.

- **pnpm workspaces + Turborepo**, TypeScript strict everywhere. **Biome** for lint and format — no ESLint, no Prettier, matching `recalio`.
- **apps/web** — TanStack Start (React 19) on Cloudflare Workers. Start 1.x is GA.
  - `@tanstack/react-start` `1.168.42`, `@tanstack/react-router` `1.170.25`, `@vitejs/plugin-react` `^6.0.1`, `vite` `8.2.1`.
  - `@cloudflare/vite-plugin` **`1.51.2`** and `wrangler` **`4.120.1`**. Do not upgrade either one: `1.51.3` and `4.121.0` both pin an unpublished `miniflare@5.20260804.1-alpha`, and install dies with `ETARGET`.
- **Cloudflare** — Workers with the static-assets binding, not Pages. D1 for data and KV for caches. No R2 in v1.
- **packages/db** — Drizzle ORM `0.45.2` with drizzle-kit `0.31.10` against D1.
- **Auth** — Clerk with Organizations. Clerk is authoritative; D1 keeps stable-ID user, workspace, and membership projections for application data and joins.
- **packages/core** — framework-free: MDX vocabulary, parse/normalize, lint, block keys, structural diff, skim projection. No React, no DB, no network.
- **packages/ui** — the shared shadcn/ui workspace with its own `components.json`, per `recalio`.
- **apps/cli** — `plantifiles` binary, Node. **apps/mcp** — stdio MCP server, Node.
- **Tailwind v4**, CSS-first with `@theme`. There is no `tailwind.config.js`.
- `zod` for validation, **TanStack Query v5** for client server-state, **Vitest 4** for `packages/core`, **Playwright** for one end-to-end smoke.

`wrangler.jsonc` must carry `"compatibility_flags": ["nodejs_compat"]` for the Worker runtime and Node-compatible dependencies. The public origin comes from a `PUBLIC_URL` var; no domain is hardcoded anywhere.

**`RESEARCH.md` carries the verified API shapes, exact config file contents, and the gotchas behind every choice above.** It was produced by running real code on workerd. Read the relevant section before writing code in each phase — it documents at least four failure modes that are silent rather than loud.

## Non-goals for v1

These are v2. Building them now starves the loop above.

Staleness/drift detection against repos, implementation status from PRs, plan graph relations, semantic search, issue export to GitHub/Linear, git two-way sync, suggestion mode, inline polls, realtime cursors, agent-written comment drafting, public link expiry/passwords.

---

# Phase 1 — packages/core

The whole product's consistency guarantee lives here. Pure functions over strings, fully unit-tested, zero I/O.

It runs in three places — the Node CLI, the Node MCP server, and the Cloudflare Worker — so it stays free of `eval`, `new Function`, and dynamic import. `node:crypto`'s `createHash` is fine because the Worker runs with `nodejs_compat`.

## The component vocabulary

Authors write Markdown plus **only** these components. Anything else is a lint error. The agent never emits raw HTML, and never controls presentation — `apps/web` owns all styling, so consistency is a property of the system rather than of the model's mood.

| Component | Props | Contains |
|---|---|---|
| `<TLDR>` | — | prose, ≤60 words |
| `<Decision>` | `owner` (required), `id` | the question as prose |
| `<Tradeoff>` | — | ≥2 `<Option>` |
| `<Option>` | `name` (required), `recommended` (boolean) | pros/cons prose or list |
| `<Rejected>` | `what` (required) | why it was rejected |
| `<Phase>` | `n` (required), `title` (required) | prose + task checklist |
| `<Risk>` | `severity` = `low` \| `med` \| `high` (required) | prose |
| `<Diagram>` | `lang` = `mermaid` \| `d2` (required) | one fenced code block |
| `<CodeSketch>` | `lang` (required), `file` | one fenced code block |
| `<Callout>` | `kind` = `note` \| `warning` (required) | prose |

Diagrams are declarative source only. The agent writes the graph; the renderer draws it in the house theme. That is what makes illustration style consistent and diagrams diffable.

Example of a well-formed plan source:

````mdx
---
title: Billing migration to Stripe
---

<TLDR>
Move subscription billing from the homegrown ledger to Stripe over three phases,
keeping the ledger as read-only history.
</TLDR>

## Why now

The ledger loses money on proration edge cases and nobody owns it.

<Decision owner="@srujan">
Do we backfill historical invoices into Stripe, or leave them in the read-only ledger?
</Decision>

<Tradeoff>
  <Option name="Backfill everything">
    One source of truth. Two weeks of work, risky mapping of legacy plans.
  </Option>
  <Option name="Ledger stays read-only" recommended>
    Ship in days. Support has to check two places for pre-2026 invoices.
  </Option>
</Tradeoff>

<Rejected what="Chargebee">
Pricing model punishes usage-based billing, which is where we're heading.
</Rejected>

<Diagram lang="mermaid">
```mermaid
graph LR
  A[checkout] --> B[Stripe]
  B --> C[webhook worker]
  C --> D[ledger read-only]
```
</Diagram>

<Phase n="1" title="Dual-write">
- [ ] Stripe customer created alongside ledger account
- [ ] Webhook worker reconciles nightly
</Phase>

<Risk severity="high">
Webhook replay could double-charge. Idempotency keys are mandatory, not optional.
</Risk>
````

## Block keys

Comments must survive new versions, so every top-level block needs an identity that is stable across versions.

At publish time, `normalize(source)` walks top-level blocks and assigns each a `key`:

1. If the block has an explicit `id` prop, `key = id`.
2. Otherwise `key = <slug of nearest enclosing heading path>:<component kind>:<ordinal within that heading>`.

Also record `contentHash` (sha256 of the block's normalized source). Emit `Block[] = { key, kind, ordinal, contentHash, source }`.

A comment anchors to `key`. On a new version, a key that still exists carries its comments forward; a key that vanished leaves its comments flagged as *anchored to an older version* with a link to that version.

## The lint

Deterministic. No model call. The skill suggests the house style; the lint is what actually enforces it.

Errors:

1. Exactly one `<TLDR>`, and it is the first block after frontmatter.
2. `<TLDR>` is ≤60 words.
3. Every `##` section's first child is a one-line summary paragraph of ≤30 words.
4. No paragraph exceeds 5 sentences or 120 words.
5. At least one `<Decision>`, at least one `<Phase>`, at least one `<Diagram>`.
6. Every `<Decision>` has an `owner`.
7. Every `<Tradeoff>` has ≥2 `<Option>` and exactly one `recommended`.
8. Every `<Risk>` has a valid `severity`.
9. Heading depth never exceeds `###`.
10. No components outside the vocabulary table, and no raw HTML.
11. Every block component puts its children on their own lines. `<Decision>text</Decision>` written on one line parses as an inline `mdxJsxTextElement`, which the renderer wraps in a `<p>` and emits as invalid nesting; only the multi-line form produces a real flow element. This rule is what keeps the parser and the renderer agreeing.

Warnings:

12. No `<Rejected>` anywhere. Six months out, "why we didn't do X" is the highest-value text in the document and always the part that is missing.
13. Read time above 12 minutes, computed at 200 wpm.

`score = 100 - (10 × errors) - (3 × warnings)`, floored at 0. Publish requires zero errors **and** `score ≥ 70`. `--force` publishes anyway and sets `lintOverridden` on the version, which the UI shows as a badge.

Every lint finding carries `{ rule, severity, message, line, blockKey? }`.

## Structural diff

`diff(prevBlocks, nextBlocks)` matches on `key`, then classifies each block as `added` / `removed` / `modified` (same key, different `contentHash`) / `moved` (same key and hash, different ordinal).

Render that to a one-paragraph `changeSummary` grouped by kind, e.g. `Removed 1 Phase (Dual-write). Added 2 Risks. Modified TLDR and 1 Decision.` Nobody reads a textual diff of a document, so this summary is the primary artifact of a new version.

If `ANTHROPIC_API_KEY` is set, additionally generate a prose summary from the structural diff and store it as `changeSummaryProse`. When the key is absent the structural summary stands alone and everything still works — this is an enhancement, never a dependency.

## Skim projection

`skim(blocks)` returns only `TLDR`, `Decision`, `Tradeoff`, `Risk`, `Diagram`, and `Phase` titles. Half-reading a plan is the normal behaviour, so make half-reading correct instead of fighting it.

**Phase 1 done when:** every rule above has a passing and a failing unit test; `normalize` produces identical keys across two versions of the example plan where the heading path is unchanged; `diff` correctly classifies all four change types; a grep of `packages/core/src` finds no `eval` and no `new Function`; `pnpm test` is green in `packages/core`.

---

# Phase 2 — scaffold, data layer, and the plan URL

Infrastructure risk first: an empty Start app must deploy to Workers with its bindings resolving before any feature work lands on top of it. `RESEARCH.md` carries the verified config for everything in this phase.

## Scaffold

```bash
npx @tanstack/cli@latest create web --framework React --deployment cloudflare --blank -y
```

Run that inside `apps/`, then pin every dependency the scaffold wrote as `latest`, and swap its ESLint/Prettier setup for Biome.

Facts that decide whether this works:

- Routes live in `apps/web/src/routes/`; the root route is `src/routes/__root.tsx`; `src/router.tsx` must export a function named `getRouter()`.
- `src/routeTree.gen.ts` is generated by `tanstackStart()` on the first `vite dev` or `vite build`, not by the scaffold. Commit it.
- Plugin order in `vite.config.ts` is load-bearing: `cloudflare({ viteEnvironment: { name: 'ssr' } })`, then `tanstackStart()`, then `viteReact()`.
- `wrangler.jsonc` sets `"main": "@tanstack/react-start/server-entry"` and `"compatibility_flags": ["nodejs_compat"]`. The vite plugin injects the `assets` block, so do not write one.
- Bindings for v1 are `DB` (D1) and `CACHE` (KV) — no R2. Create the database with `wrangler d1 create plantifiles`, paste the returned `database_id`, and add `"migrations_dir": "migrations"`.
- Re-run `wrangler types` after every binding change; it writes `worker-configuration.d.ts`.

**The `env` rule is a build-breaker, not a style preference.** Touch `env` from `cloudflare:workers` only inside `createServerFn().handler()`, `server.handlers`, `.server()` middleware, or a `*.server.ts` module. Referencing it from a route loader or a component body runs fine under `vite dev` and then fails `vite build` with `Rolldown failed to resolve import "cloudflare:workers"`.

## Drizzle schema

Clerk owns identities, sessions, Organizations, roles, and invitations. The application `user`, `workspace`, and `membership` tables are stable-ID projections linked by nullable unique Clerk IDs; only linked workspaces authorize production access.

D1 is SQLite, which changes how three things are expressed. `text({ enum: [...] })` is a TypeScript union that creates **no** database constraint, so pair every one with a `check()`. JSON is `text(..., { mode: 'json' })` with a `$type<...>()`. Timestamps are `integer(..., { mode: 'timestamp' })`, which stores Unix **seconds** — never mix that with `timestamp_ms` anywhere in the schema, because the failure mode is silently landing in 1970.

```ts
// packages/db/src/schema.ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, check, unique } from 'drizzle-orm/sqlite-core'

export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const plan = sqliteTable('plan', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  status: text('status', { enum: ['draft','in_review','approved','building','shipped','archived'] }).notNull().default('draft'),
  visibility: text('visibility', { enum: ['private','workspace','public'] }).notNull().default('workspace'),
  publicSlug: text('public_slug').unique(),
  createdById: text('created_by_id').notNull().references(() => user.id),
  currentVersionId: text('current_version_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  unique('plan_workspace_slug').on(t.workspaceId, t.slug),
  check('plan_status_ck', sql`${t.status} in ('draft','in_review','approved','building','shipped','archived')`),
])
```

The remaining tables carry the same columns the product needs, expressed the same way:

- `planVersion` — `id` pk, `planId` fk, `number` int, `source` text (raw MDX), `changeSummary` text nullable, `changeSummaryProse` text nullable, `lintScore` int, `lintReport` json, `lintOverridden` boolean, `authorId` fk, `agentName` text nullable, `agentPrompt` text nullable, `createdAt` timestamp. Unique on `(planId, number)`.
- `planBlock` — `id` pk, `versionId` fk, `key`, `kind`, `ordinal` int, `contentHash`. Unique on `(versionId, key)`.
- `comment` — `id` pk, `planId` fk, `versionId` fk, `blockKey` nullable, `parentId` nullable, `body`, `authorId` fk, `agentAssisted` boolean, `resolvedAt` nullable, `createdAt`.
- `decision` — `id` pk, `planId` fk, `key`, `status` enum `open|resolved`, `resolution` nullable, `ownerId` nullable, `resolvedById` nullable, `resolvedAt` nullable. Unique on `(planId, key)`.
- `approval` — `id` pk, `planId` fk, `versionId` fk, `userId` fk, `createdAt`. Unique on `(versionId, userId)`.
- `membership` — `id` pk, `userId` fk, `workspaceId` fk, `role` enum `owner|admin|member|viewer`.
- `apiToken` — `id` pk, `userId` fk, `name`, `tokenHash` unique, `lastUsedAt` nullable.

A `decision` row holds only app state: status, resolution, owner. The question text always comes from the `<Decision>` block in the source, so the document and the database can never disagree about what was asked.

**Migrations**: `drizzle-kit generate` writes flat `migrations/0000_*.sql`, and `wrangler d1 migrations apply plantifiles --local | --remote` applies them. Do not run `drizzle-kit migrate` or `drizzle-kit push` — that introduces a second migration journal alongside wrangler's `d1_migrations` table.

**Two D1 limits shape the write path.** There are no interactive transactions: Drizzle's `transaction()` emits `begin`/`commit`, which D1 rejects outright, so every multi-statement write goes through `db.batch([...])`. And a query takes at most 100 bound parameters, so inserting a version's blocks must be chunked rather than issued as one wide multi-row insert.

A D1 row caps at 2 MB. v1 rejects a source above 1 MB with a clear error; offloading large bodies to R2 is v2.

## Server routes

Every endpoint is a file in `src/routes/` whose `createFileRoute` carries a `server` property. Handler signature is `({ request, params, context, next }) => Response`.

- `api.plans.ts` — `POST /api/plans` with `{ workspaceSlug, slug?, title, source, agentName?, agentPrompt? }`. Lints, normalizes, then creates plan + version 1 + blocks in one `db.batch`. Rejects with the full lint report on failure. `GET /api/plans?workspace=slug&status=` lists.
- `api.plans.$id.ts` — `GET` metadata plus current version.
- `api.plans.$id.versions.ts` — `POST` a new version; computes `changeSummary` against the current version and re-anchors comments.
- `api.plans.$id.comments.ts` — `POST { blockKey?, parentId?, body, agentAssisted? }`.
- `api.tokens.ts` — `POST`, session-authed only, returns the plaintext token exactly once.

Token auth is `Authorization: Bearer <token>`, sha256-hashed and compared against `apiToken.tokenHash`. Browser requests use Clerk sessions and synchronously project the active Organization membership.

Note that a route defining only `POST` answers a `GET` with 200 and SSR HTML rather than 405. Where method rejection matters, add an explicit `ANY` handler returning 405.

## The content-negotiated plan URL

The single most important surface in the product. One URL, two audiences.

`src/routes/p.$workspaceSlug.$planSlug.tsx` defines **both** a `server.handlers.GET` and a `component`, and that combination is what makes negotiation possible:

```tsx
export const Route = createFileRoute('/p/$workspaceSlug/$planSlug')({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        const accept = request.headers.get('accept') ?? ''
        const wantsHtml = accept.includes('text/html')
        if (!wantsHtml) {
          const md = await renderPlanMarkdown(params)
          return new Response(md, {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
          })
        }
        return next()          // defers to SSR HTML
      },
    },
  },
  loader: ({ params }) => getPlan({ data: params }),
  component: PlanReader,
})
```

`next()` exists only because the same route defines `component`; without one it throws. This defer behaviour is shipping but **undocumented**, which is exactly why `@tanstack/react-start` is pinned and why this phase owes an integration test asserting both branches of this route.

The Markdown branch returns raw MDX source behind a YAML frontmatter preamble carrying `title`, `version`, `status`, `url`, `openDecisions`, and `updatedAt`. A `.md` suffix or `?format=md` forces it too. Because it is plain HTTP and plain text, Claude Code, Codex, Cursor, and Aider all consume plans with zero per-tool integration. Always send `Vary: Accept`, never gate the Markdown response behind JavaScript, and never return HTML to a client that asked for Markdown.

`p.$workspaceSlug.$planSlug.v.$number.tsx` does the same for a specific version.

Private and workspace-visibility plans require a session or a bearer token; `public` plans serve both representations anonymously via `publicSlug`. Static assets are served ahead of the Worker, so plan URLs stay under the `/p/` prefix where they cannot collide with a filename in `dist/client`.

**Phase 2 done when:** `wrangler deploy --dry-run` succeeds and lists the `DB` and `CACHE` bindings; `wrangler d1 migrations apply plantifiles --local` creates every table; `curl -H 'Accept: text/markdown'` on a seeded plan returns frontmatter plus MDX and nothing else; the same URL in a browser returns SSR HTML; an automated test asserts both negotiation branches; posting a second version returns a non-empty `changeSummary`; and a lint-failing source is rejected with per-rule findings.

---

# Phase 3 — CLI

Publishing must happen from inside the agent session. A dev who has to copy HTML into a web form never comes back, so this phase is adoption, not convenience.

Commands:

- `plantifiles login` — prompts for a token from `/settings/tokens` (Phase 4 builds that page), stores it in `~/.config/plantifiles/config.json` at mode `0600`.
- `plantifiles push <file> [--workspace slug] [--title t] [--agent claude-code] [--prompt "..."] [--force]` — creates or updates. Writes the plan id back into `.plantifiles.json` in the repo root keyed by file path, so subsequent pushes update instead of duplicating. Prints the plan URL.
- `plantifiles pull <id|url> [-o file]` — fetches Markdown. This is the command an agent runs at build time.
- `plantifiles lint <file>` — runs `packages/core` locally, exits non-zero on errors, prints findings as `file:line rule message`.
- `plantifiles open <id>` — opens the URL in a browser.
- `plantifiles status [--workspace slug]` — table of plans with status, version, open decisions, pending approvals.

`PLANTIFILES_TOKEN` overrides the config file. Honor `PLANTIFILES_BASE_URL`.

**Phase 3 done when:** on a clean machine with only a token, `plantifiles push plan.mdx` prints a URL, `plantifiles pull` on that URL returns byte-identical source, and a second `push` of an edited file creates version 2 with a populated change summary.

---

# Phase 4 — design system and app shell

**A published plan is a page of the app, not a document the app hosts.** No iframe, no sanitized HTML blob, no separate stylesheet, no `dangerouslySetInnerHTML`. A plan body is React components built from the same shadcn primitives and the same tokens as the dashboard chrome, so a plan and the plan list are visibly the same product. That continuity is the magic; losing it turns this into a nicer artifact host.

Read `skill://design` and follow it, with one substitution: it assumes a Tailwind v3 `tailwind.config`, and this project is Tailwind v4, so tokens are declared CSS-first with `@theme`. Everything else holds — Radix/shadcn primitives are mandatory over hand-rolled equivalents, Lucide for icons, semantic variables, Inter and JetBrains Mono, design tokens rather than magic numbers. The shadcn components live in `packages/ui` with their own `components.json`, matching `recalio`.

## The theme

The skill's palette is the shadcn default — take the *mechanism*, not the identity. Pick a distinctive accent and one signature typographic move, then record both in `DECISIONS.md`. A layout indistinguishable from every other dashboard fails this phase.

Declare the token layer once, CSS-first, in `apps/web/src/styles.css` under `@theme`, and extend it with plan-block semantics: `--color-decision`, `--color-risk-low`, `--color-risk-med`, `--color-risk-high`, `--color-phase`, `--color-success`, `--color-warning`, `--color-diagram-node`, `--color-diagram-edge`. Dashboard chrome and plan blocks consume that single set. Dark mode ships from day one, and the Mermaid theme config reads those same variables at runtime rather than carrying its own palette — so one token change restyles chrome, blocks, and diagrams together.

## Layout

Fixed dimensions, so every route lines up and a plan page inherits the same skeleton as the dashboard:

- Sidebar `w-60`, fixed, full height, `border-r`. Topbar `h-14`, sticky, `border-b`.
- Content column `max-w-5xl` centered, `px-6 py-8`.
- Prose inside a plan sits on a `max-w-[68ch]` measure. A 12-minute document set at full window width is the single most common way a reader gets abandoned halfway.
- Outline rail `w-56`, `sticky top-16`, appears at `xl` and above.
- Vertical rhythm in a plan: `space-y-6` between top-level blocks, `mt-10` before an `##`, `mt-6` before `###`, `leading-7` on paragraphs.
- Bordered blocks are `rounded-lg border p-5` and sit flat beside each other. The one nested case is `<Option>` inside `<Tradeoff>`, which drops the border for `bg-muted/40`.
- Icons are `h-4 w-4` inline, `h-5 w-5` in a block header.
- Every block label uses one style: `text-xs font-medium uppercase tracking-wide text-muted-foreground`. That single repeated detail is most of what makes ten different block types read as one designed system.

Status chips are defined once and reused by the dashboard, the reader header, and the Slack unfurl:

| Status | Treatment |
|---|---|
| `DRAFT` | `bg-muted text-muted-foreground` |
| `IN_REVIEW` | accent tint, `bg-accent/15 text-accent-foreground` |
| `APPROVED` | `--success` tint |
| `BUILDING` | accent tint with a pulsing dot |
| `SHIPPED` | `--success`, outline rather than filled |
| `ARCHIVED` | `bg-muted text-muted-foreground/70` |

## The shell

The application shell is one compact row: Plantifiles, Clerk Organization switcher, agent tokens, theme, and account controls. The plan reader and dashboard use the same content region.

Routes, with the TanStack Start file that owns each. Shell chrome lives in `src/routes/__root/-components/`, following the dash-prefixed colocation convention:

- `/` — redirect signed-out users to hosted Clerk sign-in, signed-in users without an Organization to Clerk Organization creation, and members to their first linked workspace.
- `/w/:slug` — workspace dashboard.
- `/settings/tokens` — create a named token, reveal the plaintext exactly once, list tokens with `lastUsedAt`, and revoke.
- `/cli` — approve or deny a CLI device login from a signed-in browser.
- `/p/:workspaceSlug/:planSlug` — reader and content-negotiated Markdown route.

## The dashboard

A plan table, not a card grid. Columns in order: **Title** (`font-medium`, truncated, `w-[40%]`), **Status** chip, **Version** as `v{n}`, **Author** (avatar plus `agentName` as `text-xs text-muted-foreground` on a second line, or "hand edit" when null), **Decisions** (`{n} open` tinted `--warning` when above zero, otherwise a muted dash), **Approvals** as the current-version count against the fixed one-approval gate, **Read time**, **Updated** as relative time. Rows are `h-14` with `border-b` separators and `hover:bg-muted/50`, no zebra striping, whole row navigates. Filter by status, sort by updated, text filter on title.

The empty state shows the literal `plantifiles push` command with the user's workspace slug already filled in, because first run is CLI-first and the browser's job there is to teach the command.

Every route gets a loading skeleton and an empty state. Keyboard navigation and contrast per the design skill. On mobile the sidebar collapses to a sheet.

**Phase 4 done when:** navigating dashboard → plan → version history never leaves the shell; the sidebar, content column, and outline rail match the stated widths; toggling dark mode restyles chrome, plan blocks, and Mermaid diagrams from the same tokens; every status renders its chip from the table above; `/settings/tokens` mints a token that `plantifiles login` accepts; `cmd+k` opens a plan by title; the dashboard empty state shows a copyable push command carrying the real workspace slug.

---

# Phase 5 — the reader

MDX is compiled and rendered at request time from the source string in D1, inside the Phase 4 shell. This is the hardest constraint in the whole build, because the obvious approach does not work on Workers.

## Why the obvious path is closed

`@mdx-js/mdx`'s `evaluate()` and `run()` construct an `AsyncFunction` from a string. Cloudflare forbids runtime code generation, so on workerd both fail with `EvalError: Code generation from strings disallowed for this context`. `next-mdx-remote` uses `Reflect.construct(Function, …)` and fails identically. Neither is usable — do not spend time trying to make them work.

## The renderer

Parse with remark, convert to hast, and render hast to React with a registry-backed evaluater that performs a **lookup** where the library would otherwise eval:

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkRehype from 'remark-rehype'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

const MDX_NODES = ['mdxFlowExpression','mdxJsxFlowElement','mdxJsxTextElement','mdxTextExpression','mdxjsEsm']

const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkMdx)
  .use(remarkRehype, { passThrough: MDX_NODES })

const evaluater = (registry: Record<string, unknown>) => () => ({
  evaluateExpression(node: any) {
    if (node.type === 'Identifier') {
      if (Object.hasOwn(registry, node.name)) return registry[node.name]
      throw new Error(`Unknown MDX component <${node.name}>.`)
    }
    if (node.type === 'Literal') return node.value
    throw new Error(`JS expressions are not allowed in plan documents (${node.type}).`)
  },
  evaluateProgram() { throw new Error('import/export are not allowed in plan documents.') },
})

export function renderPlan(source: string, registry: Record<string, unknown>) {
  const hast = pipeline.runSync(pipeline.parse(source))
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components: registry, createEvaluater: evaluater(registry) })
}
```

Three details are load-bearing, and each one fails **silently** when missed:

1. `remark-rehype` must receive `passThrough` with all five MDX node types. Omit it and every `<Decision>` degrades to a bare `<div>` with no warning whatsoever.
2. A capitalized component name arrives at `createEvaluater` as an ESTree `Identifier`, which is why the registry lookup lives there. With no evaluater at all, custom components throw `Cannot handle MDX estrees without createEvaluater`.
3. A **lowercase** unknown name skips the evaluater entirely and renders as a raw unknown tag with no error — `<decision owner="x">hi</decision>` just renders. Close that hole with a strict `components` Proxy trapping `getOwnPropertyDescriptor`; the library gates on `hasOwnProperty`, so trapping `has` accomplishes nothing.

Props arrive verbatim — no `class`→`className` rewriting, no kebab mangling — and a bare attribute like `recommended` arrives as boolean `true`.

A hast tree is plain JSON, and `JSON.parse` of a cached tree benchmarked roughly 14× faster than reparsing a 14 KB document. That is a KV cache keyed by content hash, worth adding once documents get large, and it is not a substitute for the renderer above: the source string stays the contract.

## Reader surfaces

- **Themed render** — one house style built from the shared tokens. Every component's treatment is specified in the anatomy table below; a block that renders as bare prose or an unstyled `div` is a bug, not a style choice.
- **Diagrams** — Mermaid is client-only, so render it in an effect after hydration against the CSS-variable theme, never during SSR. v1 draws `lang="mermaid"` only; `lang="d2"` renders its source in a code block, because no Workers-safe D2 path is proven. Note that in `DECISIONS.md`.
- **Code highlighting** — Shiki's default WASM engine fails on Workers with `Wasm code generation disallowed by embedder`. Use `createHighlighterCore` with `createJavaScriptRegexEngine()` and fine-grained theme and language imports, and build the highlighter lazily inside a request rather than at module scope, because Worker global scope must finish in one second.
- **Skim toggle** — switches between skim projection and full document, persisted per user in `localStorage`.
- **Header** — title, status chip, version selector, read time, lint score, open-decision count, "Copy Markdown URL" button.
- **Outline rail** — sticky right-hand jump list of headings and decisions, collapsing on mobile. A 12-minute document needs a map.
- **Version history** — versions with author, agent name when present, and `changeSummary`. Selecting two shows the structural diff grouped by kind, with per-block old/new source. The prose summary appears above it when available.
- **Provenance** — every version shows `agentName` and, on expand, `agentPrompt`. "Edited by @srujan via claude-code" is the point; the prompt that produced a version is first-class history here.

## Block anatomy

All ten components, so none of this is left to invention. Each block also carries an anchor `id` equal to its block key, and a comment button in the left gutter revealed on `group-hover`.

| Component | Treatment |
|---|---|
| `<TLDR>` | No border. `text-lg leading-8` lead paragraph directly under the plan title, `border-l-2 border-accent pl-4`. Always the first thing on the page. |
| `<Decision>` | Bordered card. Header row: `HelpCircle`, the label, owner handle pushed right, and an Open/Resolved pill. Question in `font-medium`. A resolution renders in a `bg-muted/40` footer inside the same card. |
| `<Tradeoff>` | No outer border. A `Scale` icon and label, then a `grid gap-3 md:grid-cols-2` of its options. |
| `<Option>` | `bg-muted/40 rounded-md p-4`, name in `font-medium`. The `recommended` one adds `ring-1 ring-accent` and a "Recommended" pill. |
| `<Rejected>` | Collapsed to a single row by default: `X` icon plus `Rejected: {what}`, expanding to the reason. It matters for the archaeology without competing with the live plan. |
| `<Phase>` | Numbered stepper. `n` inside a `rounded-full bg-accent/15` circle on the left, title in `font-semibold`, checklist items as display-only `Checkbox` at `text-sm`. |
| `<Risk>` | Bordered card with `border-l-4` in `--risk-{severity}`. Header: `AlertTriangle` plus `Risk · {severity}`. |
| `<Diagram>` | Full content width, `rounded-lg border bg-muted/20 p-6`, SVG centered, "View source" disclosure beneath. |
| `<CodeSketch>` | `rounded-lg border` with a `bg-muted` filename bar carrying the `file` prop in JetBrains Mono `text-xs`, highlighted body below via Shiki. |
| `<Callout>` | The lightest treatment of the set: `bg-muted/40 border-l-2` with `Info` or `AlertTriangle` per `kind`. |

**Phase 5 done when:** the example plan from Phase 1 renders with every block matching its row in the anatomy table; an unknown capitalized component and an unknown lowercase element each throw rather than rendering; the Mermaid diagram draws in house colors after hydration; prose holds the 68ch measure; skim mode hides prose while keeping decisions and diagrams; the outline rail jumps to blocks; and the diff view for v1→v2 shows the changed blocks.

---

# Phase 6 — review

The thing that makes a plan more than a wiki page.

- **Comments anchored to blocks.** Hovering a block reveals a comment affordance; threads are one level deep — a comment and its replies. Comments carry `agentAssisted` and render a small marker when set. Comments whose `blockKey` no longer exists in the current version render in a collapsed "from an earlier version" group linking to the version they were written against.
- **Decisions.** Every `<Decision>` block in the source gets a resolution control in the reader: the owner (or any admin) records a resolution, which sets `Decision.status = RESOLVED`. Resolved decisions collect into a **Decision log** at the bottom of the plan, question and resolution paired. That log is an ADR trail the team gets for free.
- **Approvals.** Any member approves the *current version*. Approving a plan then pushing a new version invalidates nothing retroactively but the gate re-evaluates against the new version, because approving v3 says nothing about v4.
- **Lifecycle.** `DRAFT → IN_REVIEW → APPROVED → BUILDING → SHIPPED → ARCHIVED`, advanced manually except for one hard gate: `APPROVED` requires exactly one approval on the current version **and** zero `OPEN` decisions. Any state may move to `ARCHIVED`. Show the blocking reason inline when the gate fails.

**Phase 6 done when:** a comment on a block survives a version bump that leaves the block intact and gets flagged when the block is deleted; resolving all decisions plus one approval flips a plan to `APPROVED`; attempting `APPROVED` with an open decision fails with a stated reason.

---

# Phase 7 — the browser editor

Deliberately minimal. Not every teammate has an agent session open, and the CLI cannot be the only way to fix a typo.

CodeMirror 6 editing the raw MDX, split view with live preview through the Phase 5 registry. `packages/core` lints on a debounce, findings show in the gutter with a running score, and the same publish gate as the API blocks a save with errors. Saving creates version N+1 with `authorId` set and `agentName` empty, which is how the UI distinguishes a hand edit from an agent push.

The save request carries the base version number. On mismatch the server rejects it and the UI says which version landed mid-edit, linking to its diff. No realtime co-editing, and no suggestion mode — both are v2.

**Phase 7 done when:** a browser edit produces version N+1 with a populated change summary and no agent name; lint errors block the save with per-rule findings; saving against a stale base version is rejected with the conflict message.

---

# Phase 8 — MCP server

Stdio server so the agent publishes and reads plans as tool calls without leaving the editor. Auth via `PLANTIFILES_TOKEN`.

Tools: `create_plan`, `update_plan`, `get_plan`, `list_plans`, `comment_on_plan`. Each is a thin wrapper over the Phase 2 endpoints — the HTTP API stays the single source of truth for behaviour.

`get_plan` returns the same Markdown-with-frontmatter representation the URL serves, so an agent gets identical bytes whether it uses the tool or plain `read` on a URL.

Ship a README with the exact `claude mcp add` invocation and the equivalent raw JSON config block for other clients.

**Phase 8 done when:** the server is registered in a real Claude Code session, `create_plan` produces a plan visible in the web UI, and `get_plan` output matches `curl -H 'Accept: text/markdown'` byte for byte.

---

# Phase 9 — Slack unfurl

Teams paste links in Slack no matter what is built, so own the preview instead of fighting the habit.

Slack app with OAuth install per workspace, subscribed to `link_shared`. Unfurl shows title, status, version number, read time, open-decision count, and pending-approval count. Link a Slack workspace to a Plantifiles workspace at install time and store the mapping.

The webhook route reads the raw body with `await request.text()` before parsing, since HMAC verification needs the bytes as sent. Give the route an explicit `ANY` handler returning 405: a route defining only `POST` answers a stray `GET` with 200 and SSR HTML, which would make a misrouted Slack retry look like a success. Push the unfurl response through `waitUntil` when the work outlives the response.

Scope is the unfurl only. Notifications back into threads are v2.

**Phase 9 done when:** pasting a plan URL into a Slack channel of the installed workspace renders the unfurl with live counts, and a `GET` on the webhook route returns 405 rather than HTML.

---

# Phase 10 — the house skill

A workspace-owned, versioned skill that teaches a coding agent to write plans in this vocabulary. Ship it as `skills/write-plan/SKILL.md` in this repo, downloadable from the web UI.

It must cover: the component vocabulary with an example of each, the lint rules stated as positive targets ("open with a TLDR under 60 words", "give every section a one-line summary"), the requirement to record rejected alternatives with reasons, the instruction to run `plantifiles lint` and fix findings before pushing, and the instruction to pass `--agent` and `--prompt` on push so provenance is captured.

The skill suggests; the lint enforces. Keep it short enough that an agent reads all of it.

**Phase 10 done when:** a fresh agent session given only the skill and a feature description produces a plan that passes lint with `score ≥ 90` on the first try.

---

# Phase 11 — smoke test

Not a test file. Run the product and show the output.

1. `wrangler d1 create plantifiles`, paste the id into `wrangler.jsonc`, `pnpm drizzle-kit generate`, `wrangler d1 migrations apply plantifiles --local`, then `pnpm dev`.
2. Sign in with GitHub, create workspace `demo`, mint a token at `/settings/tokens`.
3. From a real agent session, write a plan for any small feature using the Phase 10 skill and `plantifiles push --agent claude-code`.
4. Land on the dashboard and confirm the new plan appears in the table with its status, version, and agent name.
5. Open it from the table. Confirm it reads as a page of the app: same sidebar, same breadcrumb, same tokens. Check the theme, the diagram, skim mode, and the outline rail. Toggle dark mode and confirm chrome, blocks, and diagram all follow.
6. `curl -H 'Accept: text/markdown' <url>` and confirm frontmatter + MDX.
7. Comment on a block. Resolve every decision. Approve. Confirm the plan reaches `APPROVED`.
8. Fix a typo in the browser editor and confirm a new version with no agent name.
9. Edit the source locally, push again, and confirm the next version with a populated change summary and the diff view.
10. In a *different* agent session, `plantifiles pull <url>` and have that agent implement one item from the plan's own `<Phase n="1">`.

Paste the real terminal output and the browser observations. Step 10 is the whole thesis of the product — if it does not work, v1 is not done.

Then, and only then: `wrangler deploy` to a real Workers environment and re-run steps 5, 6, and 10 against the deployed URL — local workerd and deployed workerd differ, and the Markdown branch is the one thing that must work from the public internet. Finish with one Playwright spec covering steps 3–9 against a seeded local D1, and `README.md` with setup plus the demo loop.

---

# Notes for whoever builds this

- `packages/core` is the deep module. Everything else is I/O around it. Keep the DB client, model calls, and React out of it so the consistency rules stay unit-testable — and keep it eval-free so it runs unchanged on Workers.
- Structure is what buys per-block comments, real diffs, and skim mode. The moment freeform HTML is allowed through, all three become impossible — that constraint is the product, not a limitation of it.
- The plan reader shares the dashboard's shell, primitives, and token set. The moment a plan needs its own stylesheet or an iframe, the product has become an artifact host and the differentiator is gone.
- Record every judgement call in `DECISIONS.md` with one line of reasoning, so the next agent inherits the why.
- `RESEARCH.md` is the verified reference for API shapes and gotchas. Four claims in it are marked UNVERIFIED — confirm those against real docs before depending on them, and correct the file in place when you learn the answer.
