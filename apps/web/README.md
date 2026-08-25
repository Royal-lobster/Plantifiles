<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# 🌐 @plantifiles/web

The Plantifiles app: dashboard, review shell, and plan reader.

---

</div>

TanStack Start (React 19) rendered in a Cloudflare Worker, D1 through Drizzle (`@plantifiles/db`), Clerk for sign-in and Organizations. Plans render as MDX with shiki highlighting and mermaid diagrams.

## 🗺️ Routes

- `/w/<slug>` — workspace dashboard and review shell
- `/p/<workspace>/<plan>` — the plan page: rendered for people, `Accept: text/markdown` for agents
- `/settings/api-keys` — Clerk user API keys for headless clients
- `/cli/callback` — OAuth callback for the CLI
- `/skills/write-plan` — serves the agent skill
- `/api/slack/*` — link unfurls

Routes are file-based under `src/routes` (TanStack Router); run `pnpm generate-routes` after adding files.

## 🛠️ Develop

D1 and `.dev.vars` setup is in the [root README](../../README.md). Then:

```bash
pnpm dev   # vite dev on :3000, CLOUDFLARE_ENV=dev
```

## 🧪 Test

```bash
pnpm test        # vitest
pnpm test:e2e    # playwright, runs the full publish/review/approve loop
```

## 🚀 Deploy

```bash
pnpm deploy        # production
pnpm deploy:dev    # dev Worker, plantifiles-dev D1
pnpm deploy:dry    # dry run
```

Runtime config comes from `config.vars`; `pnpm vars:gen` regenerates `config.generated.ts`.
