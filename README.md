<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="88" alt="Plantifiles logo" />

# 🌱 Plantifiles

Agent-native plan documents. An agent publishes a structured plan, the team reviews and approves it in the browser, and another agent pulls the approved Markdown back into its build session.

---

</div>

## 📦 Apps and packages

| Path | What it is |
| --- | --- |
| [`apps/web`](./apps/web) | The app: dashboard, review shell, plan reader |
| [`apps/cli`](./apps/cli) | The `plantifiles` command-line client, published to npm |
| [`apps/mcp`](./apps/mcp) | The same loop as an MCP server over stdio |
| [`packages/core`](./packages/core) | The plan format: parsing, linting, structural diffing |
| [`packages/auth`](./packages/auth) | OAuth login and credential storage for CLI and MCP |
| [`packages/api-client`](./packages/api-client) | Typed HTTP client for the Plantifiles API |
| [`packages/db`](./packages/db) | Drizzle schema and D1 client |
| [`packages/ui`](./packages/ui) | Shared React components |

## 📋 Prerequisites

- Node.js 22 or newer
- pnpm 11.17.0 through Corepack
- A Cloudflare account for production deployment
- A Clerk application with Organizations enabled
- Optional: a Slack app for link unfurls

## 🛠️ Local setup

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler d1 create plantifiles
```

Copy the D1 database ID into `apps/web/wrangler.jsonc`, then apply migrations:

```bash
pnpm db:generate
pnpm db:migrate:local
printf 'VARS_KEY=%s\n' "$(pnpm --dir apps/web exec vars key export)" > apps/web/.dev.vars
chmod 600 apps/web/.dev.vars
pnpm dev
```

`pnpm dev` runs the `dev` Cloudflare environment, so local dev and `dev.plantifiles.com` share one `wrangler.jsonc` block: same vars profile, same D1 binding. SSR runs inside workerd and inherits nothing from your shell, which is why `VARS_KEY` has to live in `.dev.vars`. `vars` uses one master key for every environment, so treat that file as a production credential: mode 600, never copied off the machine, and rotate with `vars rotate` (plus the Clerk secrets) if it leaks.

Open <http://localhost:3000> and sign in through Clerk. The local database starts empty; the first signed-in request projects your Clerk user, Organization, and membership into it. There is no seeded identity and no local-only auth branch — local runs take the same path as production.

## 🔁 Demo loop

Build the CLI and authorize this machine. `login` opens Clerk in the browser; paste the one-time code from the callback page back into the terminal:

```bash
pnpm --filter plantifiles build
node apps/cli/dist/index.js login --base-url http://localhost:3000
```

Tokens go in the system keychain, with a mode-0600 file fallback where no keychain exists. Headless environments use a Clerk API key from `/settings/api-keys` instead:

```bash
export PLANTIFILES_BASE_URL=http://localhost:3000
export PLANTIFILES_TOKEN=ak_replace_with_your_clerk_api_key
```

Give [`skills/write-plan/SKILL.md`](./skills/write-plan/SKILL.md) to a coding agent, then publish the plan it writes:

```bash
node apps/cli/dist/index.js lint plan.mdx
node apps/cli/dist/index.js push plan.mdx \
  --workspace <workspace-slug> \
  --agent claude-code \
  --prompt "Plan the requested feature"
```

At login the CLI records a default workspace when your account has exactly one; otherwise `push` and `status` need `--workspace <slug>` (`workspaces` lists them). Later pushes of the same file reuse its tracked workspace.

Open the printed URL, review, comment, resolve every decision, approve. The same URL serves Markdown to agents:

```bash
curl -H 'Accept: text/markdown' http://localhost:3000/p/<workspace-slug>/<plan-slug>
node apps/cli/dist/index.js pull http://localhost:3000/p/<workspace-slug>/<plan-slug> -o approved-plan.mdx
```

Edit `plan.mdx` and push again for version 2 — the reader shows a block-level diff. In another agent session, pull the approved URL and build from it.

Pushed into the wrong organization? `move` takes the plan with its history, comments, and decisions, no republish needed. Approvals on the current version are cleared, because the new org hasn't reviewed it:

```bash
node apps/cli/dist/index.js move plan.mdx --to <workspace-slug>
```

Only the author can move a plan, and only into an org they belong to. Pass `--slug <slug>` if the destination already has a plan at that slug — the plan page's actions menu does the same thing and previews the collision. The old URL stops resolving after a move.

The MCP server exposes the same loop over stdio: [`apps/mcp`](./apps/mcp).

## 👥 Workspaces and members

Every workspace maps to a Clerk Organization. Use Clerk's switcher to create one, invite members, and manage member/admin roles. Membership is projected into D1 so plans, reviews, OAuth sessions, and user-scoped API keys keep stable local authorship.

## 💬 Slack unfurls

Create a Slack app with:

- bot scopes `links:read` and `links:write`
- bot event subscription `link_shared`
- event request URL `${PUBLIC_URL}/api/slack/events`
- OAuth redirect URL `${PUBLIC_URL}/api/slack/callback`
- the hostname from `PUBLIC_URL` as an app unfurl domain

## ✅ Verification

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm --dir apps/web exec wrangler deploy --dry-run
```

The Playwright smoke runs the whole loop against a local Worker: hosted OAuth callback, publish, review, comment, resolve, approve, a second version with a structural diff, and CLI pull byte parity.

## 🚀 Deployment

Runtime configuration is generated from `apps/web/config.vars` with `pnpm --filter @plantifiles/web vars:gen`. Commit `config.generated.ts`: it holds public config and encrypted ciphertexts, never decrypted secrets. Environments pick their profile through `VARS_ENV` in `wrangler.jsonc`. `VARS_KEY` is the only Worker secret:

```bash
pnpm --dir apps/web exec wrangler secret put VARS_KEY
pnpm --dir apps/web exec wrangler secret put VARS_KEY --env dev
```

Clerk keys live inside the vars bundle — don't add them as separate Worker or GitHub Actions secrets.

The CLI's OAuth client ID is in the vars bundle too. Each environment needs one public Clerk OAuth application: PKCE required, opaque access tokens, a `${PUBLIC_URL}/cli/callback` redirect URI, and the scopes `profile email offline_access plantifiles:read plantifiles:write`. Clerk only checks declared scopes after sign-in, so a missing scope surfaces as a failed callback rather than a rejected URL. User API keys must be enabled on the Clerk instance for `/settings/api-keys` to work.

GitHub Actions builds, applies migrations, and deploys on updates to `main`. It needs the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets (Workers edit + D1 edit).

Manual production deploy:

```bash
pnpm db:migrate:remote
pnpm --filter @plantifiles/web run deploy
```

Dev Worker with its own D1 database and domain:

```bash
pnpm --filter @plantifiles/web migrate:dev
pnpm --filter @plantifiles/web deploy:dev
```
