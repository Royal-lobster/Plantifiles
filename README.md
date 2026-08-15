# Plantifiles

Agent-native plan documents. An agent publishes a structured plan, the team reviews and approves it in the browser, and another agent pulls the approved Markdown back into its build session.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.17.0 through Corepack
- A Cloudflare account for production deployment
- GitHub OAuth credentials for production sign-in
- Optional: a Slack app for link unfurls

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler d1 create plantifiles
pnpm exec wrangler kv namespace create CACHE
```

Copy the D1 database ID and KV namespace ID into `apps/web/wrangler.jsonc`. Plantifiles keeps local application configuration in `apps/web/config.vars`; private values are encrypted by dotvars. Obtain the project `VARS_KEY` through the team secret channel, then create the Worker binding file and apply migrations:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
# Set VARS_KEY in apps/web/.dev.vars.
pnpm --filter @plantifiles/web vars:gen
pnpm db:generate
pnpm db:migrate:local
pnpm dev
```

The `dev` dotvars profile defines `BETTER_AUTH_SECRET`, GitHub OAuth credentials, `PUBLIC_URL`, and `LOCAL_DEV`. `LOCAL_DEV="true"` exposes the local-only Demo User sign-in. The GitHub callback is `${PUBLIC_URL}/api/auth/callback/github`.

Open <http://localhost:3000/login>, sign in as Demo User, and create a token at `/settings/tokens`. The plaintext token appears once.

## Demo loop

Build the command-line client and configure its connection:

```bash
pnpm --filter @plantifiles/cli build
export PLANTIFILES_BASE_URL=http://localhost:3000
export PLANTIFILES_TOKEN=pf_replace_with_the_token_from_settings
```

Download `skills/write-plan/SKILL.md` from the user menu, give it to a coding agent, and publish the resulting plan with provenance:

```bash
node apps/cli/dist/index.js lint plan.mdx
node apps/cli/dist/index.js push plan.mdx \
  --workspace demo \
  --agent claude-code \
  --prompt "Plan the requested feature"
```

Open the printed URL. Confirm the plan appears in the dashboard, review it in the shared shell, add comments, resolve every decision, and approve the current version. The same URL serves Markdown to agents:

```bash
curl -H 'Accept: text/markdown' http://localhost:3000/p/demo/<plan-slug>
node apps/cli/dist/index.js pull http://localhost:3000/p/demo/<plan-slug> -o approved-plan.mdx
```

Edit `plan.mdx` and run the same `push` command to create version 2. The reader shows the structural summary and a block-level diff. In a separate agent session, pull the approved URL and implement one checklist item from its `<Phase>` blocks.

The MCP server exposes the same loop over stdio. Build it with `pnpm --filter @plantifiles/mcp build`; its exact Claude Code configuration and tool list are in [`apps/mcp/README.md`](apps/mcp/README.md).

## Slack unfurls

Create a Slack app with:

- bot scopes `links:read` and `links:write`
- bot event subscription `link_shared`
- event request URL `${PUBLIC_URL}/api/slack/events`
- OAuth redirect URL `${PUBLIC_URL}/api/slack/callback`
- the hostname from `PUBLIC_URL` as an app unfurl domain

Store `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SIGNING_SECRET` in the `dev` and `prod` profiles of `apps/web/config.vars`. Private values stay encrypted; do not add them to `.dev.vars` or as individual Worker secrets. An owner or admin can then connect a Slack team from workspace settings. Plantifiles stores the bot token encrypted and maps one Slack team to one Plantifiles workspace.

## Verification

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm --dir apps/web exec wrangler deploy --dry-run
```

The Playwright smoke starts the local Worker, applies D1 migrations, signs in, mints a token, publishes through the CLI, checks the dashboard and reader, fetches Markdown, comments, resolves, approves, pushes a second version, verifies the structural diff, and confirms CLI pull byte parity.

## Production deployment

Production uses the `prod` profile in `apps/web/config.vars`; `apps/web/wrangler.jsonc` sets `VARS_ENV="prod"`. Private values are committed only as ciphertext. The Worker stores one application configuration secret: `VARS_KEY`.

To update production configuration:

```bash
cd apps/web
pnpm dlx dotvars@1.0.6 show config.vars
# Edit the prod values in config.unlocked.vars.
pnpm dlx dotvars@1.0.6 hide
pnpm vars:gen
pnpm exec wrangler secret put VARS_KEY
```

Commit both `config.vars` and `config.generated.ts`. GitHub Actions then builds, applies D1 migrations, and deploys on updates to `main`. The workflow requires the repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; the API token needs Workers edit and D1 edit access.

For a manual deployment:

```bash
pnpm db:migrate:remote
pnpm --filter @plantifiles/web run deploy
```
