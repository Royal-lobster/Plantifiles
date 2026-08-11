# Brief — build Plantifiles v1

You are implementing this product end to end. `PLAN.md` is the complete spec and is settled; `CONVENTIONS.md` is the house style for `apps/web`, extracted from a real reference repo. Where the two conflict, `PLAN.md` wins.

## How to work

Read `PLAN.md` in full before writing code, then `CONVENTIONS.md`. Build a todo list from its eleven phases and work them in order. Each phase ends in a **done when** clause — that clause is the gate, so satisfy it before moving on.

Work autonomously. Decide the small stuff yourself using the reference conventions and record every judgement call as one line in `DECISIONS.md`. Do not stop to ask for approval, direction, or confirmation.

Commit after each phase with a message naming the phase. Skip project-wide reformatting.

## Structure

`PLAN.md` fixes the monorepo layout: `apps/web`, `apps/cli`, `apps/mcp`, `packages/core`, `packages/db`. Apply `CONVENTIONS.md` **inside `apps/web`** — its route groups, `_components/` `_actions.ts` `_schema.ts` colocation, flat `lib/`, and shadcn placement are the target, not the repo root.

`packages/core` stays framework-free: no React, no Prisma, no network, no model calls. It is pure functions over strings and it carries the unit tests. Everything else is I/O around it.

## Local environment

Bring up Postgres with a `docker compose.yml` you write. Create `.env.example` covering `DATABASE_URL`, `AUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `PLANTIFILES_BASE_URL`, and the optional `ANTHROPIC_API_KEY`.

GitHub OAuth credentials are not provisioned for you. GitHub stays the real provider per the spec, and to keep the Phase 11 smoke test runnable you may add a dev-only sign-in that is unreachable when `NODE_ENV === "production"`. Note it in `DECISIONS.md`.

## Verification

Phase 11 is not optional and it is not a test file. Run the product, drive the whole loop, and paste the real terminal output plus what you observed in the browser. The load-bearing step is the last one: a *separate* agent session pulling the plan back down as Markdown and building from it. That step is the entire thesis of the product.

Do not report v1 complete until that loop runs.

## Division of labour

Visual polish comes to me afterwards — build every UI surface to the specs in Phase 4 and Phase 5 (layout dimensions, status chip table, block anatomy table), then leave aesthetic refinement alone. Spend your effort on correctness, structure, and the loop.
