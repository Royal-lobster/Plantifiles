# Plantifiles

Agent-native plan documents. An agent publishes a structured plan, the team reviews and approves it in the browser, and another agent pulls the approved Markdown back into its build session.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.17.0 through Corepack
- A Cloudflare account for production deployment
- A Clerk application with Organizations enabled
- Optional: a Slack app for link unfurls

## Local setup

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

`pnpm dev` runs the `dev` Cloudflare environment (`CLOUDFLARE_ENV=dev`), so local dev and
`dev.plantifiles.com` resolve the same `wrangler.jsonc` block: the same `VARS_ENV=dev` vars
profile and the same `plantifiles-dev` D1 binding, one locally and one remote. Nothing about
the environment is configured twice.

`.dev.vars` carries the single secret and is gitignored; hosted environments get the same
value from `wrangler secret put VARS_KEY`. It is required because SSR runs inside workerd
under `@cloudflare/vite-plugin`, whose environment is assembled from `wrangler.jsonc` plus
`.dev.vars` — a parent process's variables are not inherited, so wrapping the dev command in
`vars run` leaves `getVars` in `apps/web/src/start.ts` with no `VARS_KEY` and every route 500s.

`vars` uses one master key for every environment, so the value in `.dev.vars` decrypts the
production ciphertexts in the same bundle, not just the `dev` block. Treat that file as a
production credential: keep it mode 600, never copy it off the machine, and rotate
`vars rotate` plus the Clerk secrets if it leaks. Per-environment keys would remove the
overlap and are the real fix.

Open <http://localhost:3000> and sign in through Clerk. Local runs use the Clerk development
instance and the real session, Organization, and workspace-projection path that production
uses; there is no seeded identity and no local-only authentication branch. The local database
starts empty, and the first signed-in request projects your Clerk user, Organization, and
membership into it.

## Demo loop

Build the command-line client and authorize this machine. `login` opens Clerk in the browser; after signing in, copy the one-time authorization code from the Plantifiles callback page into the terminal:

```bash
pnpm --filter @plantifiles/cli build
node apps/cli/dist/index.js login --base-url http://localhost:3000
```

OAuth access and refresh tokens are stored in the system keychain, with a mode-0600 credential-file fallback when no keychain is available. `plantifiles logout` revokes the refresh token. CI and other headless environments use a user-scoped Clerk API key created at `/settings/api-keys`:

```bash
export PLANTIFILES_BASE_URL=http://localhost:3000
export PLANTIFILES_TOKEN=ak_replace_with_your_clerk_api_key
```

Download `skills/write-plan/SKILL.md` from `/skills/write-plan/SKILL.md`, give it to a coding agent, and publish the resulting plan with provenance:

```bash
node apps/cli/dist/index.js lint plan.mdx
node apps/cli/dist/index.js push plan.mdx \
  --workspace <workspace-slug> \
  --agent claude-code \
  --prompt "Plan the requested feature"
```

At login, the CLI records a default only when your account has exactly one workspace. Otherwise the first `push` and `status` require `--workspace <slug>`; run `node apps/cli/dist/index.js workspaces` to list the slugs you can target. Later pushes of the same file reuse its tracked workspace.

A plan pushed into the wrong organization moves without being republished, taking its
version history, comments, and decisions with it. Approvals on the current version are
cleared, because the new organization has not reviewed it, and the file's next `push`
follows the plan:

```bash
node apps/cli/dist/index.js move plan.mdx --to <workspace-slug>
```

Only the plan's author can move it, and only into an organization they belong to. Pass
`--slug <slug>` when the destination already has a plan at that slug; the plan page's
actions menu offers the same move, names the collision before you commit to it, and
previews the resulting URL. The old URL stops resolving after a move.

Open the printed URL. Confirm the plan appears in the dashboard, review it in the shared shell, add comments, resolve every decision, and approve the current version. The same URL serves Markdown to agents:

```bash
curl -H 'Accept: text/markdown' http://localhost:3000/p/<workspace-slug>/<plan-slug>
node apps/cli/dist/index.js pull http://localhost:3000/p/<workspace-slug>/<plan-slug> -o approved-plan.mdx
```

Edit `plan.mdx` and run the same `push` command to create version 2. The reader shows the structural summary and a block-level diff. In a separate agent session, pull the approved URL and implement one checklist item from its `<Phase>` blocks.

The MCP server exposes the same loop over stdio. Build it with `pnpm --filter @plantifiles/mcp build`; its exact Claude Code configuration and tool list are in [`apps/mcp/README.md`](apps/mcp/README.md).

## Workspaces and members

Every Plantifiles workspace maps to a Clerk Organization. Use Clerk's organization switcher to select or create one, invite members, and manage member/admin roles. Plantifiles projects that organization membership into D1 so plans, reviews, OAuth sessions, and user-scoped API keys keep stable local authorship.

## Slack unfurls

Create a Slack app with:

- bot scopes `links:read` and `links:write`
- bot event subscription `link_shared`
- event request URL `${PUBLIC_URL}/api/slack/events`
- OAuth redirect URL `${PUBLIC_URL}/api/slack/callback`
- the hostname from `PUBLIC_URL` as an app unfurl domain

## Verification

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm --dir apps/web exec wrangler deploy --dry-run
```

The Playwright smoke starts the local Worker, applies D1 migrations, verifies the hosted OAuth callback, publishes through the CLI's deterministic local credential adapter, checks the dashboard and reader, fetches Markdown, comments, resolves, approves, pushes a second version, verifies the structural diff, and confirms CLI pull byte parity.

## Deployment

Runtime configuration is generated from `apps/web/config.vars` with `pnpm --filter @plantifiles/web vars:gen`. Commit `config.generated.ts`: it contains public configuration and encrypted per-environment ciphertexts, never decrypted private values. Production and dev select their profiles through `VARS_ENV` in `apps/web/wrangler.jsonc`.

Install `VARS_KEY` once as the only configuration secret on each Worker:

```bash
pnpm --dir apps/web exec wrangler secret put VARS_KEY
pnpm --dir apps/web exec wrangler secret put VARS_KEY --env dev
```

Clerk keys are managed inside the vars bundle and must not be added as separate Worker or GitHub Actions secrets. Wrangler preserves installed Worker secrets across deploys.

The CLI's OAuth client ID lives in the vars bundle alongside the Clerk keys, so no additional
Worker secret is required. Each environment needs one public Clerk OAuth application with PKCE
required, opaque access tokens, a `${PUBLIC_URL}/cli/callback` redirect URI, and the scopes
`profile email offline_access plantifiles:read plantifiles:write`. Clerk rejects an authorization
request for any scope the application does not declare, and it defers that check until after
sign-in, so a missing scope surfaces as a failed callback rather than a rejected URL. Clerk user
API keys must be enabled on the instance for `/settings/api-keys` to issue credentials.

GitHub Actions builds, applies D1 migrations, and deploys on updates to `main`. The workflow requires the repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; the API token needs Workers edit and D1 edit access.

For a manual production deployment:

```bash
pnpm db:migrate:remote
pnpm --filter @plantifiles/web run deploy
```

Build, migrate, and deploy the dev Worker with its dev D1 database and custom domain:

```bash
pnpm --filter @plantifiles/web migrate:dev
pnpm --filter @plantifiles/web deploy:dev
```
