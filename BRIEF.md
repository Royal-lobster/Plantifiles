# Brief — build Plantifiles v1

You are implementing this product end to end on **TanStack Start (React) + the Cloudflare stack**. Read these three, in this order:

1. `PLAN.md` — the complete spec. Settled.
2. `RESEARCH.md` — verified API shapes, exact config file contents, and gotchas, produced by running real code on workerd. This is not background reading; it is the reference that keeps you from four silent failure modes.
3. `CONVENTIONS.md` — house style, extracted from the `recalio` repo. Note its caveat: recalio is a Router SPA plus a separate Hono Worker, so take its conventions and not its architecture.

Where any two conflict, `PLAN.md` wins.

## State of the repo

An earlier attempt targeted Next.js + Postgres + Prisma. That stack is gone, and its scaffold has been deleted — it survives only in git history at commit `e120e1f` if you ever want to look. Do not resurrect it.

**`packages/core` is already built, committed, and passing 25 tests. Keep it.** It is framework-free by design and survives the stack change intact. Two things it still owes you:

- Error rule 11 in Phase 1 is new: block components must put their children on their own lines. Add the rule and its tests.
- Confirm it stays free of `eval` and `new Function`, since it now has to run on Workers as well as Node.

Everything else starts from the TanStack Start scaffold described in Phase 2.

## How to work

Build a todo list from the eleven phases and work them in order. Each phase ends in a **done when** clause — that clause is the gate, so satisfy it before moving on.

Work autonomously. Decide the small stuff yourself using `CONVENTIONS.md` and record every judgement call as one line in `DECISIONS.md`. Do not stop to ask for approval or direction.

Commit after each phase with a message naming the phase. Skip project-wide reformatting.

## Structure

The monorepo is `apps/web`, `apps/cli`, `apps/mcp`, `packages/core`, `packages/db`, `packages/ui`. Apply `CONVENTIONS.md` inside `apps/web`: `-components/` colocation, `(group)/` route naming, hoisted zod `validateSearch`, Tailwind v4 `@theme` tokens, Biome for lint and format, shadcn living in `packages/ui` with its own `components.json`.

`packages/core` stays pure: no React, no DB, no network, no `eval`.

## Local environment

`wrangler d1 create plantifiles`, paste the id into `wrangler.jsonc`, then `drizzle-kit generate` and `pnpm db:migrate:local`. `pnpm dev` selects the `dev` Cloudflare environment, so local runs resolve the same `wrangler.jsonc` block as the hosted dev Worker: the `VARS_ENV=dev` vars profile and the `plantifiles-dev` D1 binding. `apps/web/.dev.vars` supplies `VARS_KEY` to the local Worker; hosted Workers get it from `wrangler secret put VARS_KEY`. Every other value — `PUBLIC_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` — is decrypted from the vars bundle at runtime.

Clerk is the identity and Organization provider in every environment, including local development. There is no local-only authentication branch and no seeded identity: sign in through the Clerk development instance and let the request-path projection create the user, workspace, and membership. Do not add custom sign-in, invitation, or workspace-creation flows.

## Verification

Phase 11 is not optional and it is not a test file. Run the product, drive the whole loop, and paste the real terminal output plus what you observed in the browser. The load-bearing step is the last one: a *separate* agent session pulling the plan back down as Markdown and building from it. That is the entire thesis of the product.

`wrangler deploy --dry-run` works without credentials and is part of the Phase 2 gate. The real `wrangler deploy` at the end of Phase 11 needs a Cloudflare account. If you have no credentials, complete everything else, then say plainly that the deploy step is blocked on Cloudflare auth and what you verified locally instead. Do not fake it, and do not quietly drop it.

## Division of labour

Visual polish comes to me afterwards — build every UI surface to the specs in Phase 4 and Phase 5 (layout dimensions, status chip table, block anatomy table), then leave aesthetic refinement alone. Spend your effort on correctness, structure, and the loop.
