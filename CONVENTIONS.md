# Conventions — extracted from the reference repo

Source: `/home/srujangurram/Developer/BrainDAO/IKWR/krwq-gift-v2`, read by a scout. This is the house style for `apps/web`; follow it unless `PLAN.md` says otherwise, and where the two conflict `PLAN.md` wins.

The reference repo is a single Next.js app; this project is a pnpm + Turborepo monorepo. Apply the route/component/data conventions inside `apps/web`, not at the repo root.

## Folder structure

NO `src/` DIR. Everything is root-level, Next.js App Router default layout:
```
<root>/
  app/                 # routes + colocated feature code (see below)
  components/          # ONLY cross-route shared UI
    ui/                # shadcn primitives (button.tsx, card.tsx, dialog.tsx, ... 18 files)
    brand.tsx          # the only non-ui shared component
  lib/                 # all server/domain logic, flat + 3 subdirs
    db.ts config.ts auth.ts utils.ts format.ts chain.ts contracts.ts cron.ts
    alerts.ts safe-action.ts operator.ts operator-attestation.ts og.tsx product-search.ts
    catalog/{cache,sync}.ts
    orders/{payment,pricing,fulfillment,delivery,refund,sweep,worker,retry,encryption,admin-observability}.ts
    providers/{index,sodagift,schemas}.ts     # external-API adapter layer
  prisma/schema.prisma + prisma/migrations/
  generated/prisma/    # Prisma client output, COMMITTED (not gitignored)
  generated/sodagift.ts# openapi-typescript output
  openapi/sodagift.json
  scripts/             # tsx-run one-offs (+ their .test.ts)
  test/server-only.ts  # 1-line `export {}` stub aliased over `server-only` in vitest
  public/ docs/
  instrumentation.ts   # + instrumentation.test.ts at root
```
No `hooks/`, no `types/`, no `styles/`, no `server/` dir — verified absent by glob. Hooks live colocated next to the components that use them (`app/(layout)/use-krwq-balance.ts`). Types are exported from the module that owns them (e.g. `export type CheckoutProduct` from `checkout-form.tsx`), never from a central types barrel. Route handlers live only in `app/api/cron/{orders,catalog,sweep}/route.ts`. Server Actions live in colocated `_actions.ts` files. Config sits at root as `*.config.{ts,mjs}`.

## Route organization

Route groups used for layout/domain separation, all lowercase parenthesized:
- `app/(landing)/` — home page + `_actions.ts` + `_components/`
- `app/(store)/` — `orders/`, `orders/[id]/`, `checkout/[id]/`, `products/[id]/`, plus a group-level `_components/order-summary.tsx`
- `app/(layout)/` — NOT a route group with pages; it is a group holding ONLY the chrome (`header.tsx`, `footer.tsx`, `providers.tsx`, `search-bar.tsx`, `wallet-button.tsx`, `payment-recovery.tsx`, `use-krwq-balance.ts`) imported by the root `app/layout.tsx`. Clever: parens keep it out of the URL space without a `_` prefix.
- `app/admin/` — a plain (non-grouped) segment, gated by `isAdmin()` in the root layout.

Special files present: root `app/layout.tsx` (the ONLY layout.tsx in the repo — no nested layouts), `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/opengraph-image.tsx`, `app/icon.svg`, `app/globals.css`. Segment-level: `checkout/[id]/loading.tsx`, `products/[id]/loading.tsx`, `products/[id]/not-found.tsx`, `products/[id]/opengraph-image.tsx`. No per-segment `error.tsx`.

`_private` folders used heavily and consistently — the core organizing idea:
- `_components/` in every segment that has UI (`app/(landing)/_components/`, `app/(store)/_components/`, `app/(store)/orders/_components/`, `app/(store)/orders/[id]/_components/`, `app/(store)/checkout/[id]/_components/`, `app/admin/products/_components/`, `app/admin/orders/_components/`)
- `_actions.ts` — Server Actions for that segment
- `_schema.ts` — zod schemas + inferred types for that segment
One exception: `app/(store)/products/[id]/product.ts` (segment data helper, no underscore).

## Server vs client split

Server-by-default, `"use client"` pushed to the LEAF. 28 files total carry the directive; every one is a leaf interactive widget, a hook, or a provider — never a `page.tsx`, never a `layout.tsx`, never an `_actions.ts`.

Data fetching sits in SERVER COMPONENTS, not a query layer. `page.tsx` is `async`, awaits `params: Promise<{id:string}>`, calls `db.*.findFirst({ select: {...} })` directly, maps the row into a plain serializable DTO type, and passes it to a client leaf. Example (`app/(store)/checkout/[id]/page.tsx`): queries Prisma, `if (!product) notFound()`, builds `const checkoutProduct: CheckoutProduct = {...}` (Decimal → `.toNumber()`), renders `<CheckoutForm product={checkoutProduct} />`.

Streaming convention — the `.server.tsx` suffix: `catalog.server.tsx`, `order-list.server.tsx`, `products-table.server.tsx`, `admin-orders.server.tsx`. Each exports a sync `XSection({ searchParams })` that returns `<Suspense fallback={<XSkeleton/>}><XData …/></Suspense>` plus a private `async function XData()` that does `await connection()` then awaits `searchParams` and the DB read. The page shell renders instantly; only the data grid suspends. `searchParams` is kept as an un-awaited `Promise` all the way down so the hero above never blocks.

TanStack Query is used ONLY for client-side polling/refetch surfaces (admin tables via `useQuery` + `keepPreviousData`, `use-krwq-balance.ts`). `QueryClient` is created inside `useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }))` in `app/(layout)/providers.tsx`.

Server Actions: yes, `next-safe-action@8`. They live in per-segment `_actions.ts`. Every one starts with BOTH `"use server";` and `import "server-only";`. Shared client in `lib/safe-action.ts`:
```ts
export class ActionError extends Error {}
export const actionClient = createSafeActionClient({
  defaultValidationErrorsShape: "flattened",
  handleServerError(error) {
    if (error instanceof ActionError) return error.message;
    console.error(error); return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});
```
Action shape: `export const createQuote = actionClient.inputSchema(quoteSchema).action(async ({ parsedInput: input }): Promise<QuoteState> => {...})`. Actions return a discriminated `{ ok: false; message } | { ok: true; ... }` result rather than throwing; field-level errors go through `returnValidationErrors(schema, { field: { _errors: [msg] } })`. Client consumes with `useAction(createQuote, { onSuccess({data,input}){...}, onError({error}){ if (error.serverError) toast.error(error.serverError) } })`.
One action bypasses next-safe-action (`app/(landing)/_actions.ts`): a plain `"use server"` async fn that does `shopInputSchema.parse(input)` itself and wraps the reader in `unstable_cache(fn, ["catalog-shop-products"], { tags: [CATALOG_CACHE_TAG] })`.

## Component conventions

- **File naming: kebab-case everywhere**, including `components/ui/*` (`toggle-group.tsx`, `input-group.tsx`). Exported symbols are PascalCase. Zero PascalCase filenames in the repo.
- **Dot-suffix role convention** — the single most distinctive idea. A feature is one folder of sibling files sharing a base name:
  `catalog.tsx` (client/presentational) · `catalog.server.tsx` (Suspense boundary + async data component) · `catalog.data.ts` (`import "server-only"` + Prisma queries + parsers) · `catalog.states.tsx` (Skeleton / Empty / NoResults) · `catalog-filters.tsx`, `catalog-shops.tsx` (leaf client widgets) · `catalog-sort.ts` (pure parse/sort helpers) · `catalog.data.test.ts`.
  Same for `order-list.{tsx,server.tsx,states.tsx,signed-out.tsx}` and `products-table.{tsx,server.tsx,states.tsx}`. Loading/empty/error UI is ALWAYS split into a `.states.tsx` file, never inlined.
- **No index barrels.** Not in `components/`, not in `components/ui/`, not in `_components/`. `lib/providers/index.ts` is the only `index.ts` and it is a real factory module, not a re-export barrel.
- **Multiple components per file is fine** when private: `catalog.server.tsx` holds `CatalogSection` (exported) plus `CatalogData`, `ResultsSummary`, `CategorySections` (module-private). One exported concept per file.
- **Prop typing: inline object literal in the signature is the default.** `function Providers({ children }: { children: React.ReactNode })`, `function CheckoutForm({ product, orderingEnabled = true }: { product: CheckoutProduct; orderingEnabled?: boolean })`. `interface Props` appears NOWHERE. When a prop shape crosses a file boundary it becomes an exported `type` next to the component (`export type CheckoutProduct = {...}`, `export type CatalogItem`, `export type CheckoutStep`) and is imported with `import { X, type XProps }`.
- **No `forwardRef` anywhere.** React 19 — `ref` is a normal prop. shadcn components are plain `function Button({...}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>)` spreading `{...props}` onto the primitive with `data-slot="button"`.
- shadcn primitives are used unwrapped and imported directly (`@/components/ui/button`); no app-level wrapper layer. Variants are extended by adding entries to the primitive's own `cva` map (this repo added `success`, `xs`, `icon-xs`, `icon-sm`), not by wrapping.
- Icons: `lucide-react`, named `XIcon` style (`ArrowLeftIcon`, `SearchXIcon`).
- shadcn `ui/` files keep upstream formatting (no semicolons, double quotes); app code uses semicolons. They deliberately don't reformat vendored primitives.

## Styling

Tailwind **v4, CSS-first — there is NO `tailwind.config.{ts,js}` file at all.** `components.json` records this: `"tailwind": { "config": "" }`.
- `postcss.config.mjs`: `{ plugins: { "@tailwindcss/postcss": {} } }` — that's the entire build wiring.
- All design tokens live in `app/globals.css` (188 lines): `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";` then `@custom-variant dark (&:is(.dark *));` then a large `@theme inline { --color-*: var(--*); --radius-sm..4xl: calc(var(--radius) ± Npx) }` block mapping utility names to CSS vars, then `:root { --background: oklch(...); --primary: oklch(0.4284 0.172 259.7023); ... }` and a `.dark` block. **All colors are `oklch()`.** Custom tokens added beyond shadcn defaults: `--success` / `--success-foreground`.
- Fonts: `next/font/google` `Geist` + `Geist_Mono` in `app/layout.tsx` exposing `--font-geist-sans` / `--font-geist-mono`, wired through `@theme inline` as `--font-sans` / `--font-mono` / `--font-heading`.
- `cn()` lives at **`lib/utils.ts`** (alias `@/lib/utils`): `twMerge(clsx(inputs))` over `class-variance-authority`-free deps (`clsx` + `tailwind-merge`).
- `class-variance-authority` used only inside `components/ui/*` for variant maps, exported alongside the component (`export { Button, buttonVariants }`) and typed via `VariantProps<typeof buttonVariants>`.
- Shared class constants are exported from the component module rather than duplicated (`export const CATALOG_GRID_CLASS` in `catalog.tsx`, consumed by `catalog.states.tsx`).
- Base primitive lib is `@base-ui/react` (shadcn style `"base-nova"`, baseColor `neutral`, `cssVariables: true`), NOT Radix.
- `cn()` is used even in `layout.tsx` for composing font variables; utility classes otherwise written inline, mobile-first, with `md:`/`lg:` prefixes.

## Data layer

- **Prisma singleton at `lib/db.ts`, alias `@/lib/db`.** Full pattern (24 lines): `import "server-only"` → `PrismaPg` driver adapter over `pg` → exported `DB_POOL_CONFIG: PoolConfig = { keepAlive: true, keepAliveInitialDelayMillis: 10_000, max: 3, connectionTimeoutMillis: 15_000 }` → `const globalForDb = globalThis as unknown as { db?: PrismaClient }` → `export const db = globalForDb.db ?? new PrismaClient({ adapter: new PrismaPg({ ...DB_POOL_CONFIG, connectionString: config.databaseUrl }) })` → `if (process.env.NODE_ENV !== "production") globalForDb.db = db`. Note the export is named **`db`**, not `prisma`.
- Prisma 7 with the new generator: `generator client { provider = "prisma-client"; output = "../generated/prisma" }`; datasource `postgresql` with **no `url` in the schema** — the URL comes from `prisma.config.ts` (`import "dotenv/config"; defineConfig({ schema, migrations: { path: "prisma/migrations" }, datasource: { url: env("DIRECT_URL") } })`). Runtime uses the pooled URL, migrations use `DIRECT_URL`.
- Imports of generated types are alias-based: `import { Prisma } from "@/generated/prisma/client"`, `import { Provider } from "@/generated/prisma/enums"`.
- **No repository/ORM-wrapper layer.** Pages and actions call `db.*` directly. The service layer is domain-shaped instead: `lib/orders/*` (payment, pricing, fulfillment, delivery, refund, sweep, worker, retry, encryption) are pure-ish functions that take inputs and return results; `lib/catalog/*` handles sync + cache tags.
- Query typing discipline: `const BASE_WHERE = {...} satisfies Prisma.ProductWhereInput` and `const CATALOG_SELECT = {...} satisfies Prisma.ProductSelect` hoisted to module scope; `as const` selects inline in actions (`paymentOrderSelect`). Always explicit `select`, never a bare findMany.
- Read modules that hit the DB start with `import "server-only"` and are named `*.data.ts`; cached reads wrap in `unstable_cache(fn, [key], { tags: [CATALOG_CACHE_TAG] })` with the tag constant exported from `lib/catalog/cache.ts`.
- **Validation: zod v4.** Two homes: (1) per-route `_schema.ts` next to the action that consumes it — `quoteSchema`, `paymentOrderInputSchema`, `submitPaymentHashInputSchema`, plus enum-derived state types via `z.enum([...])` + `z.infer` + the `export const X = xSchema.enum` trick and `.extract([...])` for subsets; (2) `lib/providers/schemas.ts` for external API response shapes and `ProviderError`/`ProviderErrorCode`.
- **Env validation in `lib/config.ts`** (208 lines, `import "server-only"` + zod): custom transforms for checksummed EVM addresses, comma-separated versioned encryption keys, boolean strings (`z.enum(["true","false"]).default("false").transform(v => v === "true")`), and URL-origin hardening. Exports a single frozen `config` object consumed everywhere as `config.databaseUrl`, `config.orderingEnabled`, `config.markupBps`…
- External integrations behind an adapter interface: `lib/providers/index.ts` declares `export type GiftCardProvider = {...}`, a `satisfies Record<Provider, GiftCardProvider>` registry keyed by the Prisma enum, and `getGiftCardProvider(provider)`. HTTP types are generated from OpenAPI (`openapi-typescript openapi/sodagift.json -o generated/sodagift.ts`).

## Config files

- **`tsconfig.json`** — single alias `"@/*": ["./*"]` (root-relative, no `src`). `target: ES2020`, `moduleResolution: "bundler"`, `strict`, `noEmit`, `incremental`, `jsx: "react-jsx"`, `plugins: [{ name: "next" }]`. `include` adds `".next/types/**/*.ts"`, `".next/dev/types/**/*.ts"`, `"**/*.mts"`.
- **`eslint.config.mjs`** — flat config, `defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**","out/**","build/**","next-env.d.ts"])])` importing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` as subpath modules. No custom rules.
- **Prettier: absent.** No `.prettierrc`, no prettier dep, no `format` script. Formatting is by convention only.
- **`next.config.ts`** — only `images.remotePatterns` (one https host, explicit `port:""`, `pathname:"/img/**"`, `search:""`) and `images.maximumRedirects: 0`. No experimental flags.
- **`package.json` scripts** — `dev: next dev`, `build: next build`, `start: next start`, `lint: eslint`, `test: vitest`, `test:run: vitest run`, `typecheck: tsc --noEmit`, `operator:create: tsx scripts/setup-operator-wallet.ts`, `smoke:sodagift: tsx --conditions=react-server scripts/sodagift-smoke.ts`, `openapi:sodagift: openapi-typescript openapi/sodagift.json -o generated/sodagift.ts`. No `db:*` / `prisma generate` scripts (invoked via `npx`). `"private": true`. Has an `overrides` block pinning transitive `ws` and `axios`.
- **Versions**: next `16.2.10`, react/react-dom `19.2.4` (both exact-pinned), typescript `^5`, `@types/node ^20`, prisma/@prisma/client `^7.9.0`, zod `^4.4.3`, tailwindcss `^4`, vitest `^4.1.10`, next-safe-action `8.6.0` (exact), viem `2.52.0` (exact). **No `.nvmrc`, no `.npmrc`, no `engines` field.**
- **`pnpm-workspace.yaml`** — no `packages:` key at all; it exists solely for an `allowBuilds:` map (`@prisma/engines: true`; `esbuild`, `sharp`, `keccak`, `bufferutil`, `prisma`, `unrs-resolver`, `@reown/appkit`, `utf-8-validate`: false). Useful template for a real monorepo's build-script allowlist.
- **`components.json`** — `style: "base-nova"`, `rsc: true`, `tsx: true`, `tailwind.config: ""`, `tailwind.css: "app/globals.css"`, `baseColor: "neutral"`, `cssVariables: true`; aliases exactly: `components: "@/components"`, `utils: "@/lib/utils"`, `ui: "@/components/ui"`, `lib: "@/lib"`, `hooks: "@/hooks"` (the hooks alias is aspirational — no `hooks/` dir exists), `iconLibrary: "lucide"`.
- **`vitest.config.ts`** — `plugins: [react()]`, `resolve.alias: { "server-only": path.resolve(import.meta.dirname, "test/server-only.ts"), "@": path.resolve(import.meta.dirname, ".") }`, `test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"] }`. Aliasing `server-only` to a stub is what makes server modules unit-testable.
- **`vitest.setup.ts`** — one line: `import "@testing-library/jest-dom/vitest";`
- **`vercel.json`** — only `crons: [{path:"/api/cron/orders", schedule:"* * * * *"}, {"/api/cron/catalog", "15 0 * * *"}, {"/api/cron/sweep", "45 * * * *"}]`.
- **`instrumentation.ts`** — root file exporting `register()` and `onRequestError: Instrumentation.onRequestError`, both guarded by `if (process.env.NEXT_RUNTIME !== "nodejs") return;` and using dynamic `await import("@/lib/alerts")` to keep node-only code out of the edge bundle.
- **`AGENTS.md`** — 4 lines telling agents that this Next.js version has breaking changes vs. training data and to read `node_modules/next/dist/docs/` first. `CLAUDE.md` is an 11-byte pointer to it.
- `.gitignore` is CRA/Next default plus `.env*` (`!.env.example`); notably does NOT ignore `generated/`.

## Testing

- **Vitest 4 + @testing-library/react 16 + @testing-library/user-event + jest-dom**, jsdom default environment. No Playwright, no E2E layer.
- **Tests are colocated, never in a `__tests__` or `test/` tree.** Pattern: `<file>.test.ts` / `<file>.test.tsx` sitting directly beside the file under test — `lib/orders/pricing.test.ts`, `app/(store)/checkout/[id]/_actions.test.ts`, `app/(store)/checkout/[id]/_components/checkout-form.test.tsx`, `app/api/cron/sweep/route.test.ts`, `app/(store)/orders/[id]/page.test.tsx`, `scripts/setup-operator-wallet.test.ts`, `instrumentation.test.ts`. Coverage is broad: route handlers, server actions, pages, hooks, and every `lib/` domain module have a sibling test.
- **Node-environment opt-out via a file-top pragma**: pure server/domain tests start with `// @vitest-environment node`; component tests use the jsdom default.
- Component test shape: `const mocks = vi.hoisted(() => ({...}))` at top, then all `vi.mock(...)` calls (relative `"../_actions"` for the segment's actions, plus `@privy-io/react-auth`, `sonner`, `next/navigation`, and alias paths like `@/app/(layout)/use-krwq-balance`), then the `import { CheckoutForm } from "./checkout-form"` AFTER the mocks, then `afterEach(cleanup)`, then module-scope fixture objects. Explicit `import { describe, expect, it, vi } from "vitest"` (no globals).
- Unit test shape: `describe("quotePrice", ...)` naming the exported function; `it("adds the provider fee and returns 18-decimal KRWQ base units")` — behavioral sentences asserting exact `toEqual` values, not snapshots.
- The `server-only` → `test/server-only.ts` (`export {}`) alias in `vitest.config.ts` is the enabling trick for testing `lib/db.ts`, `lib/config.ts`, `lib/auth.ts` and every `_actions.ts` directly.

## Worth copying

Worth copying:
1. **The dot-suffix file-role vocabulary** (`x.tsx` / `x.server.tsx` / `x.data.ts` / `x.states.tsx` / `x-sort.ts`). Filename alone tells you the environment and responsibility; features stay in one folder without inventing directories. Extremely legible to both humans and agents.
2. **`_components` / `_actions.ts` / `_schema.ts` colocation per route segment**, with promotion to `components/` or `lib/` only when a second segment needs it. `components/` ended up with exactly one non-`ui` file — a good sign the discipline held.
3. **`(layout)` route group as a home for root-layout chrome** — keeps `header/footer/providers` out of both `components/` and the URL space.
4. **Suspense boundary as a dedicated `.server.tsx` module** that keeps `searchParams` as an un-awaited Promise until the innermost async component, plus `await connection()` to opt that subtree into dynamic rendering. Shell renders instantly.
5. **`server-only` imported at the top of every server module** (`lib/db.ts`, `lib/config.ts`, `lib/auth.ts`, every `_actions.ts` — which carry BOTH `"use server"` and `import "server-only"`), combined with the vitest alias to a stub so those modules remain unit-testable. Cheap, mechanical, catches leaks at build time.
6. **`lib/config.ts` as a single zod-validated frozen env object** with domain-aware transforms (checksummed addresses, versioned key maps, URL-origin hardening) — nothing reads `process.env` ad hoc except `NEXT_PUBLIC_*` in client files.
7. **Actions return discriminated `{ ok: true | false }` results** instead of throwing; `ActionError` is the only exception type mapped to a user-visible message, everything else collapses to `DEFAULT_SERVER_ERROR_MESSAGE`. Field errors via `returnValidationErrors`.
8. **Adapter registry typed by a Prisma enum**: `satisfies Record<Provider, GiftCardProvider>` makes adding an enum value a compile error until an adapter exists.
9. **`satisfies Prisma.XWhereInput` / `Prisma.XSelect` on hoisted query constants** — reuse without losing narrowed result types.
10. **`instrumentation.ts` with runtime-guarded dynamic imports** for alerting + `onRequestError`.
11. **Tailwind v4 with zero config file**; all tokens in `app/globals.css` under `@theme inline` + oklch `:root`.
12. **`AGENTS.md` warning that the framework version postdates model training** and pointing at `node_modules/next/dist/docs/`.
13. **`// @vitest-environment node` pragma** to keep domain tests out of jsdom instead of splitting into two vitest projects.
14. `pnpm-workspace.yaml` used purely for an `allowBuilds:` allowlist (`@prisma/engines: true`, everything else false).

## Do not copy

1. **Both `pnpm-lock.yaml` (502 KB) and `package-lock.json` (788 KB) are committed**, and `README.md` still says `npm install` / `npx prisma migrate dev` while the repo is pnpm-configured. Pick one package manager; delete the other lockfile.
2. **`generated/prisma/` is committed** — `.gitignore` never mentions `generated/`. In a monorepo, generate into `packages/db/generated` (or `node_modules/.prisma`) at build time and ignore it. Same for `generated/sodagift.ts`.
3. **`tsconfig.tsbuildinfo` (999 KB) is committed at the repo root** despite `*.tsbuildinfo` being in `.gitignore` — it was added before the rule. Don't replicate.
4. **`.env` (1.8 KB) is present in the working tree** next to `.env.example`. Ignored by `.gitignore`, but do not carry this file across.
5. **No Prettier and no formatting script** — `components/ui/*` uses no semicolons while app code does. Add Prettier (or Biome) on day one rather than inheriting the two-dialect mix.
6. **No `engines` field, no `.nvmrc`, no `packageManager` field.** Node/pnpm versions are entirely unpinned. Pin them.
7. **Some server actions are enormous** — `app/(store)/checkout/[id]/_actions.ts` is 789 lines, with a single `createQuote` action running ~200 lines of sequential `try/catch` around every DB and provider call, each returning a bespoke message string. The error-message-per-catch style should be factored into a result helper; don't copy the length.
8. **`components.json` declares a `hooks: "@/hooks"` alias for a directory that doesn't exist**, so `shadcn add` of any hook-bearing component would create an orphan tree. Either create `hooks/` or fix the alias.
9. **`app/(landing)/_actions.ts` bypasses the `actionClient`** and hand-rolls `schema.parse(input)` on an `input: unknown` param — a second validation convention beside next-safe-action. Standardize on one.
10. **The `@/*` → `./*` alias maps the entire repo root**, so `@/scripts/...`, `@/openapi/...`, `@/generated/...` are all importable from app code. In the monorepo prefer `@/*` → `./src/*` per app plus real workspace packages (`@repo/core`, `@repo/db`) instead of one root-wide wildcard.
11. `app/admin/` is an ungrouped segment authorized by an `isAdmin()` call inside the root layout that renders on every request; a route group with its own layout (or middleware) is the cleaner seam.
12. `docs/superpowers/` (agent-generated specs/plans) is committed into the product repo — noise unless you deliberately want it.
