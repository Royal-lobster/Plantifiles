# Contributing to Plantifiles

Plantifiles is a pnpm workspace built around a TanStack Start application on Cloudflare Workers. This guide contains the repository, development, verification, and deployment details; the [README](./README.md) stays focused on the product.

## Repository structure

| Path | Purpose |
| --- | --- |
| `apps/web` | Dashboard, review experience, plan reader, and HTTP routes |
| `apps/cli` | The published `plantifiles` command-line client |
| `apps/mcp` | MCP server over stdio |
| `packages/core` | Parsing, linting, metadata, normalization, and structural diffs |
| `packages/auth` | Clerk OAuth and credential storage for CLI and MCP clients |
| `packages/api-contract` | Shared Zod schemas and types for the HTTP interface |
| `packages/api-client` | Typed client for the Plantifiles HTTP interface |
| `packages/db` | Drizzle schema, D1 client, and migrations |
| `packages/ui` | Shared React primitives |
| `skills/write-plan` | The coding-agent authoring skill served by the web app |

## Requirements

- Node.js 22 or newer
- pnpm 11.17.0 through Corepack
- A Cloudflare account for deployment
- A Clerk application with Organizations enabled

## Local setup

Install dependencies and create the local D1 database:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/web exec wrangler d1 create plantifiles
```

Copy the database ID into `apps/web/wrangler.jsonc`, then generate and apply migrations:

```bash
pnpm db:generate
pnpm db:migrate:local
```

Export the vars master key for the Worker runtime:

```bash
printf 'VARS_KEY=%s\n' "$(pnpm --dir apps/web exec vars key export)" > apps/web/.dev.vars
chmod 600 apps/web/.dev.vars
```

Start the workspace:

```bash
pnpm dev
```

Open <http://localhost:3000> and sign in through Clerk. Local development uses the same authentication and Organization projection path as production; there is no seeded identity or local-only authentication branch.

`pnpm dev` selects the `dev` profile from `apps/web/wrangler.jsonc`. SSR runs inside workerd and does not inherit shell variables, so `VARS_KEY` must be available through `apps/web/.dev.vars`.

Treat `.dev.vars` as a production credential. Keep it mode `0600`, never copy it off the development machine, and rotate the vars key and Clerk secrets if it leaks.

## Exercising the complete product loop

Build the CLI and authorize it against the local Worker:

```bash
pnpm --filter plantifiles build
node apps/cli/dist/index.js login --base-url http://localhost:3000
```

For headless environments, create a user API key at `/settings/api-keys` and configure:

```bash
export PLANTIFILES_BASE_URL=http://localhost:3000
export PLANTIFILES_TOKEN=ak_replace_with_your_clerk_api_key
```

Use the repository's authoring skill, then lint and publish its output:

```bash
node apps/cli/dist/index.js lint plan.mdx
node apps/cli/dist/index.js push plan.mdx \
  --workspace <workspace-slug> \
  --agent claude-code \
  --prompt "Plan the requested feature"
```

Review and approve the printed URL in the browser, then verify both agent-facing retrieval paths:

```bash
curl -H 'Accept: text/markdown' http://localhost:3000/p/<workspace-slug>/<plan-slug>
node apps/cli/dist/index.js pull http://localhost:3000/p/<workspace-slug>/<plan-slug> -o approved-plan.mdx
```

A second push of the same file creates a new version and should produce a structural diff. To exercise Organization moves:

```bash
node apps/cli/dist/index.js move plan.mdx --to <workspace-slug>
```

## Generated files

Regenerate files through their owning package rather than editing generated output:

```bash
pnpm --filter @plantifiles/web generate-routes
pnpm --filter @plantifiles/web cf-typegen
pnpm --filter @plantifiles/web vars:gen
pnpm db:generate
```

Commit `apps/web/config.generated.ts`. It contains public configuration and encrypted ciphertexts, not decrypted secrets.

## Verification

Run focused checks while developing, then the repository checks before opening a pull request:

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
pnpm --dir apps/web exec wrangler deploy --dry-run
```

The Playwright suite runs against a local Worker with one worker process. It covers hosted authentication, publishing, review comments, decision resolution, approval, version diffs, API keys, and CLI pull parity.

Keep tests attached to observable behavior. Do not add tests that only assert implementation structure or source text.

Pull requests and `main` updates run the `Verify` job in `.github/workflows/build.yml`. Configure the default branch to require the `Verify` status check before merging. A `main` update then runs the Clerk-backed Playwright workflow before the production deployment job. The same E2E workflow runs nightly and can be started manually.

## Runtime configuration

Runtime configuration is generated from `apps/web/config.vars`:

```bash
pnpm --filter @plantifiles/web vars:gen
```

Environments select a profile through `VARS_ENV` in `apps/web/wrangler.jsonc`. `VARS_KEY` is the only Worker secret:

```bash
pnpm --dir apps/web exec wrangler secret put VARS_KEY
pnpm --dir apps/web exec wrangler secret put VARS_KEY --env dev
```

Clerk keys belong inside the encrypted vars bundle, not in separate Worker or GitHub Actions secrets.

Each environment needs a public Clerk OAuth application with:

- PKCE required
- opaque access tokens
- `${PUBLIC_URL}/cli/callback` as a redirect URI
- `profile email offline_access plantifiles:read plantifiles:write` scopes
- user API keys enabled for `/settings/api-keys`

## Database migration safety

The production workflow applies migrations before it deploys the new Worker. Every migration must therefore remain compatible with both the currently deployed Worker and the incoming Worker.

Use expand-and-contract changes:

1. **Expand:** add nullable columns, new tables, or new indexes. Do not rename or drop anything the current Worker reads.
2. **Migrate:** deploy code that tolerates both representations and backfill existing rows when needed.
3. **Contract:** remove old reads and writes in a later deployment. Drop obsolete schema only after the previous Worker can no longer receive traffic.

Do not combine a destructive rename or drop, a new `NOT NULL` constraint, and the code cutover in one deployment. Generate migrations with `pnpm db:generate`, review the SQL, and run the D1 migration tests before committing it.

Before a manual production migration, record a D1 Time Travel bookmark:

```bash
pnpm --dir apps/web exec wrangler d1 time-travel info plantifiles
```

If application code fails but stored data is sound, revert the application change on `main`; the additive migration stays in place and the deployment workflow restores the previous compatible behavior. Do not restore D1 merely to roll back code.

If a migration or new Worker corrupts stored data, stop further deployments, restore the compatible Worker first, then restore the database with the bookmark printed before the migration:

```bash
pnpm --dir apps/web exec wrangler d1 time-travel restore plantifiles --bookmark <bookmark>
```

D1 Time Travel acts on the remote database and restoration is destructive. Confirm the database name and recovery point before running it.

## Deployment

GitHub Actions verifies pull requests, records a D1 recovery bookmark, applies migrations, and deploys verified `main` updates. Configure these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Workers edit and D1 edit permissions
- `VARS_KEY` for the Clerk-backed E2E workflow

For a manual production deployment, finish verification and build the exact bundle before changing the database:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @plantifiles/web build
pnpm --dir apps/web exec wrangler deploy --dry-run
pnpm --dir apps/web exec wrangler d1 time-travel info plantifiles
pnpm db:migrate:remote
pnpm --dir apps/web exec wrangler deploy
```

Deploy the development Worker and its D1 migrations with:

```bash
pnpm --filter @plantifiles/web migrate:dev
pnpm --filter @plantifiles/web deploy:dev
```

## Changes and releases

Keep pull requests focused and update every affected caller when changing an interface. Add a changeset for user-visible changes to published packages:

```bash
pnpm changeset
```

The release workflow opens or updates a version pull request while changesets are pending. After that pull request is merged, the next run publishes the packages.