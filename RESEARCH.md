# Research — verified facts for the Cloudflare / TanStack Start rewrite

Four background research agents produced this. Treat it as the source of truth for API shapes, package names, and config file contents. Anything marked UNVERIFIED must be confirmed against the real docs before you rely on it.



---

# TanStack Start on Cloudflare Workers

### answer

# TanStack Start on Cloudflare Workers — verified 2026-08-12

Everything below was proven by building and running a real app (`examples/react/start-basic-cloudflare` @ commit `7e93431`, plus routes I added) under `vite dev`, `vite build`, `vite preview`, `wrangler dev`, and `wrangler deploy --dry-run` on workerd. Findings marked **VERIFIED-BY-RUN** were executed.

---

## 1. Packages + versions (npm `latest`, 2026-08-12)

Start 1.x is **stable/GA** — `latest` dist-tag on the 1.x line; `beta` is a stale `0.0.1-beta.204`.

| package | version | role |
|---|---|---|
| `@tanstack/react-start` | **1.168.42** (pub. 2026-08-09) | framework; provides `plugin/vite`, `server-entry` |
| `@tanstack/react-router` | **1.170.25** | router (peer + direct dep) |
| `@tanstack/react-router-devtools` | 1.167.1 | dev only |
| `@cloudflare/vite-plugin` | **1.51.2** ← use this, NOT 1.51.3 | CF adapter |
| `wrangler` | **4.120.1** ← use this, NOT 4.121.0 | CLI/deploy |
| `vite` | 8.2.1 (peer `>=7.0.0`) | rolldown-based |
| `@vitejs/plugin-react` | ^6.0.1 | required |
| `react` / `react-dom` | ^19.2.0 (peer `>=18 \|\| >=19`) | |
| `@tanstack/router-cli` | 1.167.27 | optional `tsr generate` |

Transitive (auto): `@tanstack/start-plugin-core@1.171.33`, `start-server-core@1.169.25`, `start-client-core@1.170.21`, `@tanstack/router-plugin@1.168.29`, `router-generator@1.167.27`.

**BLOCKER, VERIFIED-BY-RUN:** `wrangler@4.121.0` and `@cloudflare/vite-plugin@1.51.3` both pin `miniflare@5.20260804.1-alpha`, which is **not published** (latest is `5.20260804.0-alpha`). `npm i` fails with `ETARGET notarget No matching version found for miniflare@5.20260804.1-alpha`. Pin `wrangler: "4.120.1"` + `@cloudflare/vite-plugin: "1.51.2"` until Cloudflare republishes.

---

## 2. Scaffold

Official command (`npx @tanstack/cli@latest create`, CLI v0.70.2). Non-interactive with the CF adapter:

```bash
npx @tanstack/cli@latest create plantifiles \
  --framework React --deployment cloudflare --blank -y
```
(Also valid: `npm create cloudflare@latest -- my-app --framework=tanstack-start`; or `npx gitpick TanStack/router/tree/main/examples/react/start-basic-cloudflare my-app`.)

Resulting layout (VERIFIED-BY-RUN, exact file list):

```
.
├── package.json
├── tsconfig.json
├── tsr.config.json            # { "target": "react" }
├── vite.config.ts
├── wrangler.jsonc
└── src/
    ├── router.tsx             # exports getRouter()  ← required name
    ├── styles.css
    └── routes/
        ├── __root.tsx         # createRootRoute({ shellComponent })
        └── index.tsx          # createFileRoute('/')
```

- Routes live in **`src/routes/`**. Root route file is **`src/routes/__root.tsx`**.
- **`src/routeTree.gen.ts` is NOT in the scaffold** — it is generated on first `vite dev`/`vite build` by `tanstackStart()`, which embeds `@tanstack/router-plugin` (`start-plugin-core/dist/esm/vite/plugin.js:14: import { tanStackStartRouter } from "./start-router-plugin/plugin.js"`). Manual escape hatch: `tsr generate` (`@tanstack/router-cli`, configured by `tsr.config.json`). VERIFIED-BY-RUN: adding `src/routes/doc.tsx` regenerated `routeTree.gen.ts` with `DocRouteImport` within ~4s, no restart.
- No `src/server.ts` / `src/client.ts` needed — Start supplies defaults.
- `src/router.tsx` must export `getRouter()` and should declare `interface Register { router: ReturnType<typeof getRouter> }`.

---

## 3. Cloudflare deploy — **Workers + static-assets binding** (NOT Pages)

Workers is what both TanStack and Cloudflare document; Cloudflare's own migration guide says "Unlike Pages, Workers has a distinctly broader set of features". Cloudflare is a TanStack "Official Hosting Partner".

**`vite.config.ts`** — plugin order matters (`cloudflare` before `tanstackStart` before `viteReact`):

```ts
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),  // ← the magic key
    tanstackStart(),
    viteReact(),
  ],
})
```

**`wrangler.jsonc`** (no `assets` block — the plugin injects it):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "plantifiles",
  "compatibility_date": "2026-08-12",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "vars": { "PUBLIC_URL": "https://plantifiles.dev" },
  "d1_databases": [{ "binding": "DB", "database_name": "plantifiles", "database_id": "<id>" }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "<id>" }],
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "plantifiles" }]
}
```
(TOML equivalent works: `main = "@tanstack/react-start/server-entry"`, `compatibility_flags = [ "nodejs_compat" ]`, `[[d1_databases]]` …)

**Scripts:**
```json
{ "dev": "vite dev", "build": "vite build && tsc --noEmit",
  "preview": "vite preview", "deploy": "npm run build && wrangler deploy",
  "cf-typegen": "wrangler types" }
```

**Build output (VERIFIED-BY-RUN):** `dist/client/` (static assets) + `dist/server/index.js` + a **generated `dist/server/wrangler.json`** containing `"main":"index.js","assets":{"directory":"../client"}`. `wrangler deploy --dry-run` printed `Read 40 files from the assets directory /…/dist/client` and listed `env.MY_KV (KV Namespace) / env.MY_DB (D1) / env.MY_BUCKET (R2) / env.MY_VAR (Environment Variable)`. So: single Worker, static assets served *ahead* of the Worker script by default (no `run_worker_first`).

`wrangler types` generates `worker-configuration.d.ts` (types `Cloudflare.Env`). Run it after every binding change.

**Custom entry** (only if you need Queues/Cron/Durable Objects) — set `"main": "src/server.ts"` and:
```ts
import handler from '@tanstack/react-start/server-entry'
export default { fetch: handler.fetch, async scheduled(event, env, ctx) { /* … */ } }
```
The default entry is literally `createStartHandler(defaultStreamHandler)` wrapped as `{ fetch }`.

---

## 4. `createServerFn`

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

export const greet = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(1) }))   // any Standard Schema
  .handler(async ({ data, signal, context }) => {
    setResponseHeader('x-sfn', '1')
    return { hello: data.name, accept: getRequestHeader('accept') ?? null }
  })

// call: loader, component, event handler, another server fn
export const Route = createFileRoute('/sfn')({
  loader: () => greet({ data: { name: 'Plantifiles' } }),
})
// in a component: const g = useServerFn(greet); await g({ data: { name: 'x' } })
```
VERIFIED-BY-RUN in the prod Worker → `{"hello":"Plantifiles","accept":"text/html"}`; `tsc --noEmit` clean; the client chunk for that route was **0.19 kB** (zod + handler stripped from the client bundle).

Facts: `type Method = 'GET' | 'POST'` (only these two). `.validator()` is the current name; `.inputValidator()` is `@deprecated`. Args are passed as `{ data }`, not positionally. Chain order is `createServerFn(opts).middleware([...]).validator(s).handler(fn)`. CSRF: Start auto-installs `createCsrfMiddleware()` for server fns unless you define `src/start.ts`, in which case you must add it yourself.

---

## 5. Server routes + **content negotiation on one route** ← the critical one

File convention: **any file in `src/routes/` whose `createFileRoute` has a `server` property**. Same file may also have `component`. Handler signature: `(ctx: { request: Request; params; context; next }) => Response | Promise<Response>`. Methods keyed `GET|POST|PUT|PATCH|DELETE|HEAD|ANY`. `[.]` escapes a literal dot (`customScript[.]js.ts` → `/customScript.js`).

**The exact idiomatic pattern for HTML-or-Markdown on one URL** (VERIFIED-BY-RUN in both dev and the built Worker):

```tsx
// src/routes/$owner.$slug.tsx  →  /:owner/:slug
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$owner/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        const accept = request.headers.get('accept') ?? ''
        if (!accept.includes('text/html')) {
          const md = await loadMarkdown(params)            // agents, curl, LLMs
          return new Response(md, {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
          })
        }
        return next()                                      // ← defers to SSR HTML
      },
    },
  },
  loader: ({ params }) => getDoc({ data: params }),
  component: DocPage,
})
```

How it works (source-verified, `packages/start-server-core/src/createStartHandler.ts`): `const mayDefer = !!foundRoute.options.component`. When true the handler is spliced into the middleware chain as-is and receives a real `next`; the chain's terminal middleware is `executeRouter`, so `next()` renders the app. When false, `next` is replaced by `throwIfMayNotDefer` and returning `undefined` throws.

Guardrails:
- **`next()` is only available when the route also defines `component`.** Otherwise: `"You cannot defer to the app router if there is no component defined on this route."`
- A handler that returns nothing on a no-component route throws: `"It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route."`
- **This defer-via-`next()` behavior is real and shipping but is NOT in the published docs** — treat it as load-bearing-but-undocumented and pin your `@tanstack/react-start` version.
- `HEAD` falls back to `HEAD → GET → ANY`, and the body is stripped (RFC 9110 §9.3.2).
- Server routes need an **exact** path match; fuzzy matches fall through to the app router.
- **VERIFIED-BY-RUN gotcha:** a `POST`-only server route answers `GET` with **200 + SSR HTML**, not 405. Add an explicit `ANY` handler returning 405 if you need method rejection (relevant for the Slack webhook route).

Plain JSON endpoint:
```ts
export const Route = createFileRoute('/api/plans')({
  server: { handlers: { GET: async ({ request }) => Response.json([{ id: 1 }]) } },
})
```
Route-level and per-handler middleware both exist; per-handler needs the `createHandlers` form:
```ts
server: {
  middleware: [authMiddleware],
  handlers: ({ createHandlers }) => createHandlers({
    GET: async ({ request }) => Response.json({}),
    POST: { middleware: [validate], handler: async ({ request }) => new Response('ok') },
  }),
}
```
VERIFIED-BY-RUN: middleware `result.response.headers.set('x-users','true')` landed on the real response (`x-users: true`, `x-test: true`, `x-test-parent: true` on `/api/users`).

Slack `link_shared` webhook (raw body for HMAC) — VERIFIED-BY-RUN:
```ts
POST: async ({ request }) => {
  const raw = await request.text()                       // raw body preserved
  const sig = request.headers.get('x-slack-signature')
  waitUntil(env.CACHE.put('last-hook', raw))             // background work
  return Response.json({ ok: true })
}
```
`request.cf` is present (returned colo `"MAA"` locally).

---

## 6. Cloudflare bindings — exact accessor

```ts
import { env, waitUntil } from 'cloudflare:workers'

await env.CACHE.put('k', 'v')                                   // KV
const row = await env.DB.prepare('select 1 as one').first()      // D1
await env.BLOBS.put('key', bytes)                               // R2
env.MY_VAR                                                      // vars/secrets
```
`cloudflare:workers` declares `export const env: Cloudflare.Env`, `export function waitUntil(promise): void`, plus `cache`, `exports`, `tracing`, `withEnv`.

VERIFIED-BY-RUN in the built Worker: `{"kv":"kv-works","d1":1,"r2":"function","myVar":"Hello from Cloudflare","ua":"Cloudflare-Workers"}`. Works identically inside `createServerFn().handler()`, inside `server.handlers`, **and** inside isomorphic route `loader`s at SSR (`Object.keys(env)` → `MY_VAR,MY_DB,MY_KV,MY_BUCKET`).

**BUILD-BREAKING GOTCHA (VERIFIED-BY-RUN).** Even though it *runs* fine in dev, a top-level `import { env } from 'cloudflare:workers'` used from code that survives into the **client** bundle (i.e. a `loader` or component body) fails `vite build`:
> `Rolldown failed to resolve import "cloudflare:workers" from "/src/routes/doc.tsx"`

Rule for the plan: touch `env` **only** inside `createServerFn().handler()`, `server.handlers`, middleware `.server()`, `createServerOnlyFn()`, or a `*.server.ts` module. Those regions are tree-shaken out of the client build. Safe pattern:
```ts
const getDoc = createServerFn().handler(async () => {
  const { env } = await import('cloudflare:workers')
  return { title: (await env.DB.prepare('…').first())?.title }
})
```

Secondary: **do not read `process.env.X` at module scope** — Start's own docs say it "run[s] before the env exists and evaluate[s] to `undefined` even on the server" on Workers, and risks inlining secrets into the client bundle. Read it per-request, or use `cloudflare:workers` `env`.

---

## 7. SSR + streaming on Workers

**Streaming SSR works.** VERIFIED-BY-RUN on the built Worker under both `vite preview` and `wrangler dev`, with a route whose loader defers a 2s promise + a 1s server fn:
- Browser UA: `ttfb=0.005s total=2.007s`; 4189 bytes of shell already delivered at the 0.5s mark. Out-of-order Suspense streaming confirmed.
- `Transfer-Encoding: chunked`, no `Content-Length`.

**`nodejs_compat` is MANDATORY.** VERIFIED-BY-RUN: with `"compatibility_flags": []` the Worker refuses to boot —
> `service core:user:…: Uncaught Error: No such module "node:stream/web". imported from "index.js"` → `MiniflareCoreError [ERR_RUNTIME_FAILURE]`

All routes returned `000`/connection refused. Keep `["nodejs_compat"]` and a `compatibility_date >= 2024-09-23`.

**Bot/agent requests are intentionally NOT streamed.** `renderRouterToStream` does `if (isbot(request.headers.get('User-Agent'))) await waitForReadyOrAbort(stream.allReady, …)` — comment: *"Bot responses wait for `allReady` so crawlers receive complete HTML."* Also `progressiveChunkSize: Number.POSITIVE_INFINITY`.
- VERIFIED-BY-RUN: default `curl/8.x` UA → `ttfb == total == 2.01s`, 0 bytes at 1.5s. Same request with a Chrome UA → `ttfb=0.005s`.
- This is *desirable* for Plantifiles (crawlers/LLMs get complete HTML) but it means **agent traffic pays full loader latency**. Another reason the `Accept:`-negotiated Markdown branch matters — it bypasses React rendering entirely.

---

## 8. Vite plugin compatibility — `@mdx-js/rollup`: **YES**

VERIFIED-BY-RUN end-to-end (build + SSR in workerd), MDX 3.1.1 + Vite 8.2.1 (rolldown) + shiki 4.4.3:

```ts
import mdx from '@mdx-js/rollup'
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    { enforce: 'pre', ...mdx({                       // ← 'pre' is required
      jsxImportSource: 'react',
      providerImportSource: '@mdx-js/react',
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeSlug, [rehypeShiki, { theme: 'github-dark' }]],
    }) },
    viteReact({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),   // ← must include mdx
  ],
})
```
SSR output contained `<h1 id="mdx-heading">`, a GFM `<table>`, `<strong>`, and shiki's `class="shiki github-dark"`. No conflict with `tanstackStart()` or `cloudflare()`. Two required tweaks: `enforce: 'pre'` (must run before the React transform) and widening `viteReact({ include })` to cover `.mdx`.

### But: **runtime MDX compilation is IMPOSSIBLE on Workers** ← plan-changing
VERIFIED-BY-RUN. `@mdx-js/mdx`'s `evaluate()` / `run()` use `new Function`, which workerd forbids:
```
{"ok":false,"err":"Code generation from strings disallowed for this context"}
```
So user-authored plan documents **cannot** be compiled MDX→component inside the Worker.

**Working alternative (VERIFIED-BY-RUN in workerd):** compile to a hast AST at runtime (pure data, no codegen) and map to React through your fixed component registry.
```ts
const file = await unified()
  .use(remarkParse).use(remarkGfm).use(remarkRehype)
  .use(rehypeReact, { Fragment, jsx, jsxs, components: REGISTRY })
  .process(markdownSource)
const element = file.result   // React element
```
Returned `<h1 data-reg="1">Hi <em>there</em></h1>` — registry override applied. (`hast-util-to-jsx-runtime` is the lower-level equivalent.) For MDX-flavoured syntax use `remark-mdx` to parse, then render known JSX element names through the registry — never `evaluate`. Compile-time MDX (`@mdx-js/rollup`) remains fine for repo-committed content.

### **Shiki at runtime needs the JS engine** ← also plan-changing
VERIFIED-BY-RUN. Default WASM/Oniguruma engine in workerd:
```
ERR: WebAssembly.instantiate(): Wasm code generation disallowed by embedder
```
Fix — `createJavaScriptRegexEngine()` (VERIFIED-BY-RUN, produced `<pre class="shiki github-dark" style="background-color:#24292e…`):
```ts
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const hl = await createHighlighterCore({
  themes: [import('@shikijs/themes/github-dark')],
  langs: [import('@shikijs/langs/typescript')],
  engine: createJavaScriptRegexEngine(),
})
```
Use explicit fine-grained theme/lang imports (never the `shiki` full bundle) to keep the Worker under the size limit.

### Remaining product pieces
- **CodeMirror 6**: browser-only; `document`/`window` at import time. Load via `React.lazy` / dynamic `import()` inside `useEffect`, or a route with `ssr: false`. Not exercised — **UNVERIFIED**.
- **Mermaid**: browser-only, heavy. Client-side lazy render. **UNVERIFIED**.
- **GitHub OAuth**: `examples/react/start-basic-authjs` exists in the repo; Start ships session primitives usable on Workers — `useSession/getSession/updateSession/sealSession/clearSession`, `getCookie/setCookie/deleteCookie` from `@tanstack/react-start/server`. Auth.js-on-Workers specifics **UNVERIFIED** (owned by `CloudflareDataAuth`).
- **Relational DB**: D1 verified working via `env.DB.prepare(...).first()`. Prisma-on-Workers **UNVERIFIED** (owned by `CloudflareDataAuth`); note Prisma's Rust engine historically needs a driver adapter on Workers.
- Docs bug to ignore: `docs/start/framework/react/guide/rendering-markdown.md` still shows `app.config.ts` + `defineConfig from '@tanstack/react-start/config'`. That API is **gone** — config lives in `vite.config.ts` via `tanstackStart()`.

### sources

#### repo

TanStack/router

#### path

examples/react/start-basic-cloudflare/vite.config.ts

#### line_start

1

#### line_end

19

#### excerpt

import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
...
  plugins: [
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],

#### repo

TanStack/router

#### path

examples/react/start-basic-cloudflare/wrangler.jsonc

#### line_start

1

#### line_end

10

#### excerpt

{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "vars": {
    "MY_VAR": "Hello from Cloudflare",
  },
}

#### repo

TanStack/router

#### path

packages/start-server-core/src/createStartHandler.ts

#### line_start

181

#### line_end

196

#### excerpt

const ERR_NO_RESPONSE = IS_DEV
  ? `It looks like you forgot to return a response from your server route handler. If you want to defer to the app router, make sure to have a component set in this route.`
  : 'Internal Server Error'

const ERR_NO_DEFER = IS_DEV
  ? `You cannot defer to the app router if there is no component defined on this route.`
  : 'Internal Server Error'

#### repo

TanStack/router

#### path

packages/start-server-core/src/createStartHandler.ts

#### line_start

417

#### line_end

430

#### excerpt

function handlerToMiddleware(
  handler: RouteMethodHandlerFn<any, AnyRoute, any, any, any, any, any>,
  mayDefer: boolean = false,
): TODO {
  if (mayDefer) {
    return handler
  }
  return async (ctx: TODO) => {
    const response = await handler({ ...ctx, next: throwIfMayNotDefer })
    if (!response) {
      throwRouteHandlerError()
    }
    return response
  }
}

#### repo

TanStack/router

#### path

packages/start-server-core/src/createStartHandler.ts

#### line_start

929

#### line_end

943

#### excerpt

const requestMethod = request.method.toUpperCase() as RouteMethod
    // Per RFC 9110 §9.3.2, HEAD must return the same header fields as GET.
    // Priority for HEAD: explicit HEAD handler → GET → ANY (last resort).
    const handler =
      requestMethod === 'HEAD'
        ? (handlers['HEAD'] ?? handlers['GET'] ?? handlers['ANY'])
        : (handlers[requestMethod] ?? handlers['ANY'])
...
    if (handler) {
      const mayDefer = !!foundRoute.options.component

      if (typeof handler === 'function') {
        routeMiddlewares.push(handlerToMiddleware(handler, mayDefer))

#### repo

TanStack/router

#### path

packages/react-router/src/ssr/renderRouterToStream.tsx

#### line_start

15

#### line_end

69

#### excerpt

// Bot responses wait for `allReady` so crawlers receive complete HTML.
...
      progressiveChunkSize: Number.POSITIVE_INFINITY,
...
    if (isbot(request.headers.get('User-Agent'))) {
      await waitForReadyOrAbort(stream.allReady, request.signal)
    }

#### repo

TanStack/router

#### path

docs/start/framework/react/guide/server-routes.md

#### line_start

1

#### line_end

30

#### excerpt

Server routes can be defined in your `./src/routes` directory of your project **right alongside your TanStack Router routes** and are automatically handled by the TanStack Start server.

```ts
// routes/hello.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hello')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return new Response('Hello, World!')
      },
    },
  },
})

#### repo

TanStack/router

#### path

docs/start/framework/react/guide/hosting.md

#### line_start

41

#### line_end

80

#### excerpt

When deploying to Cloudflare Workers, you'll need to complete a few extra steps before your users can start using your app.
The official Cloudflare Workers setup currently uses Vite through `@cloudflare/vite-plugin`.

1. Install `@cloudflare/vite-plugin` and `wrangler`
...
3. Add a `wrangler.jsonc` config file
...
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry"

#### repo

TanStack/router

#### path

docs/start/framework/react/guide/environment-variables.md

#### line_start

7

#### line_end

7

#### excerpt

**Read env per-request, not at module scope.** On Cloudflare Workers and other edge SSR runtimes, env vars are injected at request time — module-level `process.env.X` reads run before the env exists and evaluate to `undefined` even on the server. ... (On Cloudflare Workers specifically, the canonical way to read env from anywhere — including module scope — is the [`cloudflare:workers` env binding])

#### repo

TanStack/router

#### path

examples/react/start-basic-cloudflare/README.md

#### line_start

51

#### line_end

57

#### excerpt

## Accessing Cloudflare Bindings

You can access Cloudflare bindings in server functions by using importable `env`:

```ts
import { env } from 'cloudflare:workers'
```

#### repo

TanStack/router (installed dist)

#### path

node_modules/@tanstack/start-client-core/dist/esm/createServerFn.d.ts

#### line_start

76

#### line_end

107

#### excerpt

validator?: ConstrainValidator<TRegister, TMethod, TInputValidator, TStrict>;
    /** @deprecated Use `validator` instead. */
    inputValidator?: ConstrainValidator<...>;
...
    handler: <TNewResponse>(fn?: ServerFn<...>) => Fetcher<TMiddlewares, TInputValidator, TNewResponse>;
...
export type Method = 'GET' | 'POST';

#### repo

TanStack/router (installed dist)

#### path

node_modules/@tanstack/react-start/dist/default-entry/esm/server.js

#### line_start

1

#### line_end

11

#### excerpt

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
var fetch = createStartHandler(defaultStreamHandler);
function createServerEntry(entry) {
	return { async fetch(...args) { return await entry.fetch(...args); } };
}
var server_default = createServerEntry({ fetch });

#### repo

cloudflare/cloudflare-docs

#### path

workers/framework-guides/web-apps/tanstack-start/index.md

#### line_start

1

#### line_end

60

#### excerpt

TanStack Start is a full-stack framework ... 3. Add a `wrangler.jsonc` configuration file:  
"compatibility_flags": ["nodejs_compat"],  
"main": "@tanstack/react-start/server-entry",  
"observability": { "enabled": true }

#### repo

cloudflare/cloudflare-docs

#### path

workers/static-assets/migration-guides/migrate-from-pages/index.md

#### line_start

20

#### line_end

24

#### excerpt

Unlike Pages, Workers has a distinctly broader set of features available to it, (including Durable Objects, Cron Triggers, and more comprehensive Observability). ... you must now set the [assets.directory] value for a Worker project.

#### repo

local verification run (workerd)

#### path

/tmp/librarian-app/src/routes/runtimemdx.ts

#### line_start

1

#### line_end

20

#### excerpt

const { evaluate } = await import('@mdx-js/mdx')
// GET /runtimemdx  ->  {"ok":false,"err":"Code generation from strings disallowed for this context"}

#### repo

local verification run (workerd)

#### path

/tmp/librarian-app/src/routes/astmdx.tsx

#### line_start

1

#### line_end

40

#### excerpt

// GET /astmdx -> {"rehypeReact":"<h1 data-reg=\"1\">Hi <em>there</em></h1>","shiki":"ERR: WebAssembly.instantiate(): Wasm code generation disallowed by embedder"}

#### repo

local verification run (workerd)

#### path

/tmp/librarian-app/wrangler.jsonc

#### line_start

5

#### line_end

5

#### excerpt

// with "compatibility_flags": [] the Worker refuses to boot:
// service core:user:tanstack-start-app: Uncaught Error: No such module "node:stream/web". imported from "index.js"
// MiniflareCoreError [ERR_RUNTIME_FAILURE]: The Workers runtime failed to start.

### api

#### signature

tanstackStart(opts?: { srcDirectory?: string; router?: {...}; prerender?: { enabled?: boolean; filter?: (page) => boolean }; spa?: {...}; pages?: [...]; sitemap?: {...} }): Plugin[]

#### description

From '@tanstack/react-start/plugin/vite'. The Start Vite plugin; embeds @tanstack/router-plugin so it generates and watches src/routeTree.gen.ts. Place AFTER cloudflare() and BEFORE viteReact().

#### signature

cloudflare(opts: { viteEnvironment?: { name: string }; inspectorPort?: number | false }): Plugin[]

#### description

From '@cloudflare/vite-plugin'. MUST be called with { viteEnvironment: { name: 'ssr' } } so Start's SSR environment runs inside workerd. Emits dist/server/wrangler.json with assets.directory pointing at dist/client.

#### signature

createFileRoute(path)({ server?: { middleware?: Middleware[]; handlers: Record<'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'ANY', RouteMethodHandlerFn> | (({ createHandlers }) => ...) }, loader?, component?, shellComponent? })

#### description

Unified app+server route. Handler ctx is { request: Request; params; context; next }. `next` is only real when the route also defines `component`; calling it defers to SSR HTML rendering. Exact match required for server handlers.

#### signature

createServerFn(opts?: { method?: 'GET' | 'POST'; response?: 'data' | 'full' | 'raw' }).middleware(m[]).validator(schema).handler(fn)

#### description

From '@tanstack/react-start'. Returns a callable Fetcher invoked as fn({ data, headers?, signal? }). `validator` accepts any Standard Schema (zod v4 verified) or a plain function. `.inputValidator` is deprecated. Handler body + validator are stripped from the client bundle.

#### signature

useServerFn(serverFn)

#### description

From '@tanstack/react-start'. React hook returning a router-aware caller for a server function (handles redirects/notFound); use in components and event handlers.

#### signature

createMiddleware(opts?).middleware(parents[]).server(async ({ next, request, context }) => { const result = await next(); result.response.headers.set(k, v); return result })

#### description

From '@tanstack/react-start'. Works for both server functions and server routes. Mutating result.response.headers is the supported way to add response headers (verified: x-users/x-test landed on the real response).

#### signature

import { env, waitUntil, cache, exports, tracing, withEnv } from 'cloudflare:workers'

#### description

Canonical Cloudflare binding accessor. `env: Cloudflare.Env` (typed by `wrangler types` into worker-configuration.d.ts). Only reference it from server-only regions, otherwise `vite build` fails to resolve the specifier for the client bundle.

#### signature

getRequest(): Request; getRequestHeader(name): string | undefined; getRequestHeaders(); getRequestIP({ xForwardedFor? }); getRequestHost(); getRequestUrl(); setResponseHeader(name, value); setResponseStatus(code, text?); getCookie/setCookie/deleteCookie; useSession/getSession/updateSession/sealSession/unsealSession/clearSession; getValidatedQuery(schema)

#### description

From '@tanstack/react-start/server' (re-exported from @tanstack/start-server-core). AsyncLocalStorage-style per-request accessors usable inside server functions, middleware and server-route handlers.

#### signature

createStartHandler(defaultStreamHandler) -> RequestHandler ; export default { fetch }

#### description

What '@tanstack/react-start/server-entry' is. Point wrangler `main` at it, or wrap it in src/server.ts to add queue/scheduled handlers and Durable Object exports.

#### signature

createHighlighterCore({ themes: [import('@shikijs/themes/X')], langs: [import('@shikijs/langs/Y')], engine: createJavaScriptRegexEngine() })

#### description

From 'shiki/core' + 'shiki/engine/javascript'. The ONLY way to run Shiki at runtime inside a Worker; the default WASM engine throws 'Wasm code generation disallowed by embedder'.

#### signature

unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeReact, { Fragment, jsx, jsxs, components: REGISTRY }).process(md) -> { result: ReactElement }

#### description

Verified-working runtime Markdown/MDX-AST -> React path on Workers with a fixed component registry. Replaces @mdx-js/mdx evaluate(), which is impossible on Workers (no eval).

#### signature

{ enforce: 'pre', ...mdx({ jsxImportSource: 'react', providerImportSource: '@mdx-js/react', remarkPlugins, rehypePlugins }) }

#### description

From '@mdx-js/rollup' 3.1.1. Compile-time MDX in a Start app. Requires enforce:'pre' and viteReact({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }). Verified building and SSR-rendering (GFM tables + shiki) inside workerd.

### version

@tanstack/react-start 1.168.42 | @tanstack/react-router 1.170.25 | @tanstack/start-plugin-core 1.171.33 | @cloudflare/vite-plugin 1.51.2 (1.51.3 is broken) | wrangler 4.120.1 (4.121.0 is broken) | vite 8.2.1 | react 19 | repo commit 7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13 (2026-08-11)

### breaking_changes

`app.config.ts` + `defineConfig from '@tanstack/react-start/config'` no longer exists. All config is `vite.config.ts` + `tanstackStart()`. The repo's own docs/start/framework/react/guide/rendering-markdown.md still shows the dead API — do not copy it.

Server routes are no longer a separate `createAPIFileRoute` / `routes/api/**` mechanism. They are a `server: { handlers }` property on a normal `createFileRoute`, in `src/routes/`, and may coexist with `component` in the same file.

`createServerFn().inputValidator()` is marked `@deprecated`; use `.validator()`.

Root route uses `shellComponent` (renders <html>/<head>/<body>) — not the old `component` + separate document convention.

`@tanstack/react-start-plugin` is stale at 1.131.50; the live plugin path is `@tanstack/react-start/plugin/vite` backed by `@tanstack/start-plugin-core`.

Cloudflare Pages is not the target. Deployment is a single Worker with a static-assets binding (`assets.directory` -> dist/client), generated into dist/server/wrangler.json.

### caveats

INSTALL BLOCKER (verified today): wrangler@4.121.0 and @cloudflare/vite-plugin@1.51.3 both pin the unpublished miniflare@5.20260804.1-alpha. `npm i` fails with ETARGET. Pin wrangler 4.120.1 + @cloudflare/vite-plugin 1.51.2.

`nodejs_compat` is required, not optional. Without it the Worker fails to start: 'No such module "node:stream/web"'.

Referencing `cloudflare:workers` `env` from an isomorphic route loader or component body works in `vite dev` but BREAKS `vite build` ('Rolldown failed to resolve import "cloudflare:workers"'). Confine env access to createServerFn handlers, server.handlers, middleware .server(), or *.server.ts.

The `return next()` defer-to-SSR trick that makes Accept-header content negotiation possible is implemented and shipping but is NOT documented. Pin @tanstack/react-start and add an integration test asserting both branches of the negotiated route.

`next()` throws unless the same route also defines `component`; a handler on a component-less route that returns undefined also throws.

A server route with only a POST handler answers GET with 200 + SSR HTML, not 405. Add an explicit `ANY` handler if you need method rejection (matters for the Slack webhook endpoint).

SSR streaming is deliberately disabled for bot user-agents (isbot on User-Agent waits for stream.allReady). Plain `curl` is classified as a bot, so curl benchmarks will show TTFB == total. Test streaming with a browser UA.

`progressiveChunkSize: Number.POSITIVE_INFINITY` is hardcoded in renderRouterToStream; you cannot tune chunking.

@mdx-js/mdx `evaluate()`/`run()` CANNOT run on Workers ('Code generation from strings disallowed'). Runtime user-authored MDX must go through an AST->React path (rehype-react / hast-util-to-jsx-runtime) with your component registry.

Shiki's default WASM engine fails on Workers ('Wasm code generation disallowed by embedder'). Use createHighlighterCore + createJavaScriptRegexEngine with fine-grained theme/lang imports.

Static assets are served ahead of the Worker script by default (no `run_worker_first`), so a document slug that collides with a filename in dist/client will serve the asset instead of your route.

`wrangler types` must be re-run after every binding change; the scaffold does not wire it into a postinstall by default (the example does).

CodeMirror 6, Mermaid, Auth.js/GitHub OAuth, and Prisma-on-Workers were NOT exercised in this run — UNVERIFIED here. The repo does ship examples/react/start-basic-authjs.

The official scaffold pins `"typescript": "^6.0.2"` and `@tanstack/react-*: "latest"`. Replace `latest` with exact versions before handing the repo to a coding agent.


---

# Cloudflare data layer and auth

### answer

# Data + Auth layer: TanStack Start on Cloudflare Workers

**Recommendation (ORM): Drizzle ORM + D1.** Prisma's D1 driver adapter is still Preview, ships a ~785 KB-gzip WASM query engine against a 3 MB (Free) / 10 MB (Paid) Worker gzip budget, and *still* requires `wrangler d1 migrations apply` anyway — so it buys nothing and costs bundle.

**Recommendation (auth): better-auth.** It is the only option with a first-party TanStack Start integration (`better-auth/tanstack-start`, `tanstackStartCookies`) *and* a Drizzle adapter, so auth tables live in the same Drizzle schema and the same `wrangler d1 migrations` pipeline.

---

## 1. ORM: Drizzle vs Prisma on D1

### Pin these versions
```jsonc
// dependencies
"drizzle-orm": "0.45.2",
// devDependencies
"drizzle-kit": "0.31.10",
"wrangler": "4.121.0",
"@cloudflare/vite-plugin": "latest"
```
**Do not use `drizzle-orm@rc`** even though drizzle's own D1 docs page says `npm i drizzle-orm@rc`. npm dist-tags today: `latest` = `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10`; `rc` = `1.0.0-rc.4`. `@better-auth/drizzle-adapter@1.6.27` declares peer `"drizzle-orm": "^0.45.2"` — the RC would break the peer.

### Driver import path
```ts
import { drizzle } from 'drizzle-orm/d1';
```

### `drizzle.config.ts`
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',                 // D1 is SQLite; there is no 'd1' dialect
  schema: './src/db/schema.ts',
  out: './migrations',               // same dir as wrangler's migrations_dir
  casing: 'snake_case',              // optional
  // Only needed for `drizzle-kit push | pull | studio` against REMOTE D1.
  // `drizzle-kit generate` needs NO credentials at all.
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
```
`driver` accepts exactly `'d1-http' | 'expo' | 'durable-sqlite'` for sqlite (plus `'turso'` via url). The `d1-http` credential triple is `{ accountId, databaseId, token }`, all required.

### Migration flow (generate with Drizzle, apply with Wrangler)
`wrangler.jsonc`:
```jsonc
"d1_databases": [{
  "binding": "DB",
  "database_name": "plantifiles",
  "database_id": "<UUID from `wrangler d1 create`>",
  "migrations_dir": "migrations"
}]
```
```sh
npx wrangler d1 create plantifiles          # prints database_id
pnpm drizzle-kit generate                   # writes migrations/0000_*.sql + migrations/meta/
npx wrangler d1 migrations apply plantifiles --local    # local .wrangler/state DB
npx wrangler d1 migrations apply plantifiles --remote   # production D1
npx wrangler d1 migrations list plantifiles --local     # what's pending
```
This works because `wrangler d1 migrations apply` "looks for top-level `.sql` files inside `migrations_dir`" — drizzle-kit's flat `0000_name.sql` layout matches; the `meta/` subfolder is ignored. Applied migrations are tracked in the `d1_migrations` table (rename via `migrations_table`). Only set `migrations_pattern` if you use a nested layout.

Do **not** use `drizzle-kit migrate` (it needs a live connection) and avoid `drizzle-kit push` against production (no review step, and D1 has no transactional DDL).

### Prisma, for the record
`@prisma/adapter-d1@7.9.1` + `prisma@7.9.1`. The Cloudflare D1 page exists only under Prisma's **v6** docs tree (`/docs/orm/v6/overview/databases/cloudflare-d1`) and is labelled Preview; the current v7 docs index (`llms.txt`) has no Cloudflare D1 entry at all. Migrations require `prisma migrate diff --from-local-d1 --to-schema ... --script` piped into a wrangler-created migration file — strictly more moving parts than `drizzle-kit generate`. **Verdict: Drizzle.**

---

## 2. Schema: how SQLite actually represents things

```ts
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
});

export const plan = sqliteTable('plan', {
  id: text('id').primaryKey(),                                        // TEXT PK
  ownerId: text('owner_id').notNull()
    .references(() => user.id, { onDelete: 'cascade' }),              // FK
  title: text('title').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] })
    .notNull().default('draft'),                                      // "enum"
  frontmatter: text('frontmatter', { mode: 'json' })
    .$type<Record<string, unknown>>().notNull(),                      // JSON
  isPublic: integer('is_public', { mode: 'boolean' })
    .notNull().default(false),                                        // boolean
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),                           // timestamp
}, (t) => [
  index('idx_plan_owner').on(t.ownerId),
  check('plan_status_ck', sql`${t.status} in ('draft','published','archived')`),
]);
```

**What each actually becomes in D1/SQLite:**

| Drizzle | SQL column | Runtime representation |
|---|---|---|
| `text(n, { enum: [...] })` | `text` | **TypeScript-only union.** `SQLiteTextBuilder` just sets `this.config.enumValues = config.enum`; zero DDL is emitted. Add an explicit `check()` if you want the DB to enforce it. |
| `text(n, { mode: 'json' })` | `text` | `SQLiteTextJson.getSQLType()` returns `'text'`; `mapToDriverValue = JSON.stringify`, `mapFromDriverValue = JSON.parse`. **Prefer this over `blob({mode:'json'})`** — drizzle's own source comment: *"It's recommended to use `text('...', { mode: 'json' })` instead of `blob` in JSON mode, because it supports JSON functions"*. D1 ships SQLite's JSON1 extension, so `json_extract(frontmatter, '$.x')` works on a text column. |
| `integer(n, { mode: 'boolean' })` | `integer` | 0/1. Read maps via `Number(value) === 1`. |
| `integer(n, { mode: 'timestamp' })` | `integer` | **Unix seconds** (`Math.floor(unix/1000)` on write, `new Date(value * 1000)` on read). Use `mode: 'timestamp_ms'` for milliseconds. There is no native DATE/DATETIME type in SQLite — pick one mode and never mix. |
| `text(n).primaryKey()` | `text primary key` | Not a rowid alias, so no autoincrement. Generate IDs in app code (`crypto.randomUUID()` is available in Workers). |
| `.references(() => x.id)` | `references` clause | D1 enforces FKs; note `PRAGMA foreign_keys` only applies to the current transaction. |

The third argument to `sqliteTable` is the **array** form: `(t) => [ index(...), check(...) ]` (the object-returning form is the legacy overload).

---

## 3. Client instantiation inside a Worker request scope

`drizzle(client, config)` performs **no I/O** — it constructs a dialect, a session and stashes `$client`. So it is safe to call anywhere, including module scope.

But Cloudflare explicitly warns against caching binding-derived clients globally:

> *"you must be careful when 'polluting' global scope with derivatives of your bindings... The correct approach would be to create a new client instance for each request."*

**So: no module-level `export const db = drizzle(env.DB)` singleton. Use a per-call factory** — it's an object allocation, not a connection.

```ts
// src/db/client.ts
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getDb = () => drizzle(env.DB, { schema });
```
```ts
// src/server/plans.ts
import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { plan } from '~/db/schema';

export const getPlan = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    return getDb().select().from(plan).where(eq(plan.id, id)).get();
  });
```

`import { env } from 'cloudflare:workers'` is the documented TanStack-Start-on-Workers pattern (Cloudflare's own TanStack Start guide uses exactly this inside `createServerFn().handler`). Top-level `env` reads are fine for **vars and secrets**; *calling methods* on a binding at top level throws ("Workers do not allow I/O from outside a request context").

**No `db.transaction()` on D1.** Drizzle's `SQLiteD1Session.transaction()` emits literal `begin` / `commit` / `rollback` statements, and D1 "operates in auto-commit" and rejects explicit transaction control. Use `db.batch([...])` instead — Cloudflare: *"Batched statements are SQL transactions. If a statement in the sequence fails... it aborts or rolls back the entire sequence."* `DrizzleD1Database.batch(...)` is typed and returns per-statement results.

---

## 4. Auth: GitHub OAuth

### better-auth vs Auth.js on Workers + D1

| | better-auth 1.6.27 | Auth.js (`@auth/core` 0.41.3) |
|---|---|---|
| TanStack Start integration | **First-party**: `better-auth/tanstack-start` exporting `tanstackStartCookies()`, plus a documented `src/routes/api/auth/$.ts` mount and `beforeLoad` guard recipe | **None.** No `@auth/tanstack-start` / `@auth/tanstack-react-start` package exists (npm 404). You hand-wire `Auth(request, config)` and cookie plumbing yourself |
| D1 storage | `@better-auth/drizzle-adapter` with `provider: 'sqlite'` → same Drizzle schema, same wrangler migrations | `@auth/d1-adapter@1.11.3` talks raw D1 (second, separate schema source of truth) or `@auth/drizzle-adapter@1.11.3` |
| Cloudflare Workers docs | Yes, dedicated install tab + `nodejs_compat` guidance | Community-maintained |

**Choose better-auth.** One schema, one migration pipeline, one framework adapter.

### Packages
```jsonc
"better-auth": "1.6.27",
"@better-auth/drizzle-adapter": "1.6.27"   // peer: drizzle-orm ^0.45.2
```
Schema generation CLI: `npx auth@latest generate` (the `auth` npm package is the better-auth CLI, currently 1.6.27). It emits a Drizzle schema for the core tables — `user`, `session`, `account`, `verification` — which you then feed through `drizzle-kit generate` + `wrangler d1 migrations apply`. `getMigrations()` / `auth.api` programmatic migration does **not** work with the Drizzle adapter (docs: *"It does not work with Prisma or Drizzle ORM adapters — use CLI migrations with those ORMs instead."*)

### `src/lib/auth.ts`
```ts
import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '~/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: {
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
  },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  plugins: [tanstackStartCookies()], // MUST be last in the array
});
```

### Mount the handler — `src/routes/api/auth/$.ts`
```ts
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '~/lib/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
```

### Read the session in a server function
```ts
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '~/lib/auth';

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  return auth.api.getSession({ headers: getRequestHeaders() });
});

export const ensureSession = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) throw new Error('Unauthorized');
  return session;
});
```
Route guard: `createFileRoute('/_protected')({ beforeLoad: async () => { const s = await getSession(); if (!s) throw redirect({ to: '/login' }); return { user: s.user }; } })`.

Client sign-in: `authClient.signIn.social({ provider: 'github' })` from `createAuthClient()` (`better-auth/react`).

### Required env / secrets
| Name | Notes |
|---|---|
| `BETTER_AUTH_SECRET` | signing key; `BETTER_AUTH_SECRETS` (plural) supports rotation |
| `BETTER_AUTH_URL` | base URL, e.g. `http://localhost:3000` locally |
| `GITHUB_CLIENT_ID` | |
| `GITHUB_CLIENT_SECRET` | |

GitHub OAuth callback URL: **`<baseURL>/api/auth/callback/github`**. You **must** request the `user:email` scope. If you register a *GitHub App* (not an OAuth App), also grant *Permissions and Events → Account Permissions → Email addresses = Read-only*, otherwise you get `email_not_found`. GitHub OAuth Apps issue no refresh token — that's expected.

### Workers compatibility flag (mandatory)
```jsonc
"compatibility_flags": ["nodejs_compat"]   // or at minimum ["nodejs_als"]
```
better-auth uses `AsyncLocalStorage`. TanStack Start on Workers already requires `nodejs_compat`, so this is free.

### Session storage strategy
- **Default and recommended:** sessions in the D1 `session` table via the Drizzle adapter, plus `session.cookieCache = { enabled: true, maxAge: 300 }`. The cookie cache is a short-lived signed cookie, so most requests validate the session with **zero D1 reads** — this matters because every D1 query counts against the subrequest budget.
- `session.expiresIn` defaults to 7 days, `updateAge` to 1 day.
- `secondaryStorage` (interface: `get(key)` / `set(key, value, ttl?)` / `delete(key)`) can be backed by a Workers KV binding if you want sessions out of D1. **Caveat:** once `secondaryStorage` is set, sessions move *out* of the DB unless you also set `session.storeSessionInDatabase: true`. KV is eventually consistent — don't do this unless you have a measured reason.
- Cookie-cache caveat: revoked sessions can stay live on other devices until `maxAge` elapses.

---

## 5. Secrets and env vars

### Local dev — `.dev.vars`
A dotenv-syntax file next to your Wrangler config:
```bash
# .dev.vars   (gitignore `.dev.vars*`)
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
SLACK_SIGNING_SECRET="..."
```
- Use `.dev.vars` **or** `.env`, never both: *"If you define a `.dev.vars` file, then values in `.env` files will not be included in the `env` object during local development."*
- Per-environment: `.dev.vars.<environment-name>`. With `@cloudflare/vite-plugin`, `CLOUDFLARE_ENV=staging vite dev` loads `.dev.vars.staging`, falling back to `.dev.vars`.
- `vite build` copies the relevant `.dev.vars` into the output dir **for `vite preview` only** — it is not deployed.
- Non-secret config goes in `vars` in `wrangler.jsonc`; never put secrets there.

### Production
```sh
npx wrangler secret put BETTER_AUTH_SECRET      # creates + deploys a new version immediately
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret delete <KEY>
# gradual deployments: wrangler versions secret put <KEY> then wrangler versions deploy
# CI bulk: wrangler deploy --secrets-file .env.production   (≤100 secrets/request)
```

### Declaring + typing
```jsonc
// wrangler.jsonc
"secrets": {
  "required": ["BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SLACK_SIGNING_SECRET"]
}
```
When `secrets.required` is set: `wrangler deploy` / `wrangler versions upload` **fail** if any are missing on the Worker, only those keys are loaded from `.dev.vars`/`.env` locally, and `wrangler types` generates the binding types from that list (so typegen works in CI where no `.dev.vars` exists).

```jsonc
// package.json
"scripts": { "cf-typegen": "wrangler types" }
```
```jsonc
// tsconfig.json
"compilerOptions": { "types": ["./worker-configuration.d.ts", "node"] }
```
`wrangler types` writes `worker-configuration.d.ts` containing the `Env` interface (bindings + secrets) *and* runtime types derived from your `compatibility_date`/`compatibility_flags`. Rerun it after every config change; you can commit it. Install `@types/node` because you use `nodejs_compat`.

Limits: 128 vars+secrets per Worker (64 on Free), 5 KB per value.

---

## 6. Search on D1

**What exists:** D1 supports a subset of SQLite extensions — **FTS5 (including `fts5vocab`)**, JSON1, and math functions.

### Option A — indexed `LIKE` (start here for a title filter)
```ts
import { like, sql } from 'drizzle-orm';
// prefix search — CAN use an index
db.select().from(plan).where(like(plan.title, `${q}%`));
```
```sql
CREATE INDEX idx_plan_title ON plan(title);
```
Cloudflare's guidance is blunt: `WHERE column LIKE '%term%'` with a **leading wildcard** prevents B-tree index use and "usually requires a full scan" — and D1 bills by **rows read**, not rows returned. `LIKE 'term%'` can use an index. Verify with `EXPLAIN QUERY PLAN` (look for `SEARCH ... USING INDEX`, not `SCAN`). Hard limit: **LIKE/GLOB patterns max 50 bytes.** For case-insensitive matching, store a normalized `title_lower` column and compare against a lowercased param.

### Option B — FTS5 (only if you need arbitrary substring / full-body search)
Drizzle has no FTS5 DSL. Create the virtual table in a hand-written migration and query with the `sql` template:
```sql
-- migrations/0002_plan_fts.sql
CREATE VIRTUAL TABLE plan_fts USING fts5(
  title, body, content='plan', content_rowid='rowid', tokenize='trigram'
);
```
```ts
const rows = await db.all(sql`
  SELECT p.* FROM plan_fts f JOIN plan p ON p.rowid = f.rowid
  WHERE plan_fts MATCH ${q} ORDER BY rank LIMIT 20`);
```
Cloudflare recommends the **trigram tokenizer** for arbitrary substring search ("can optimize patterns containing at least three consecutive non-wildcard Unicode characters"), with the warning that "FTS5 indexes increase storage and write costs."

**Hard caveat:** `wrangler d1 export` **does not support virtual tables** — a database containing an FTS5 table cannot be exported. The documented workaround is drop-virtual-tables → export → recreate. That is a real operational cost; don't adopt FTS5 for a title filter you can serve with a prefix index.

Also available: SQLite generated columns and `json_extract()` on your `text({mode:'json'})` frontmatter column, both supported by D1.

---

## 7. Local dev loop (persistent local D1)

```jsonc
// vite.config.ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), react()],
});
```
```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "plantifiles",
  "compatibility_date": "2026-08-11",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "d1_databases": [{ "binding": "DB", "database_name": "plantifiles",
                     "database_id": "<UUID>", "migrations_dir": "migrations" }],
  "secrets": { "required": ["BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] }
}
```
```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "deploy": "pnpm build && wrangler deploy",
  "cf-typegen": "wrangler types",
  "db:generate": "drizzle-kit generate",
  "db:migrate:local": "wrangler d1 migrations apply plantifiles --local",
  "db:migrate:remote": "wrangler d1 migrations apply plantifiles --remote",
  "db:studio": "drizzle-kit studio"
}
```
First run:
```sh
npx wrangler d1 create plantifiles     # paste database_id into wrangler.jsonc
pnpm cf-typegen
pnpm db:generate && pnpm db:migrate:local
pnpm dev                                # http://localhost:3000
```
Ad-hoc SQL against the local DB:
```sh
npx wrangler d1 execute plantifiles --local --command "select id,title from plan limit 5"
```

**Persistence:** both `wrangler dev` and `@cloudflare/vite-plugin` persist to **`.wrangler/state`** by default (the plugin's `persistState` option defaults there; `false` disables, `{ path }` relocates). Cloudflare: *"By default, in Wrangler v3 and above, data is persisted across each run of `wrangler dev`."* Because both tools share that directory, `wrangler d1 migrations apply --local` and `vite dev` see the same database. Add `.wrangler/` to `.gitignore`.

---

## 8. Hard Workers/D1 limits that bite this product

**Workers (Paid → Free)**
- **CPU per request: 30 s default, raisable to 5 min** via `"limits": { "cpu_ms": 300000 }`; Free is **10 ms**. Network waits (D1, fetch) don't count. Cloudflare's own note: SSR + auth workloads "typically use 10-20 ms" — MDX compile + Shiki highlight per request could approach the Free ceiling, so **Free plan is not viable for SSR-rendering MDX**; cache compiled output.
- **Subrequests: 10,000 per invocation (Paid) / 50 (Free).** D1 queries, KV, R2 and `fetch` all count.
- **Simultaneous open connections: 6** (waiting-for-headers), and separately "up to six connections to D1 per invocation".
- **Memory: 128 MB per isolate.**
- **Worker startup (global scope) must complete in 1 s.** Don't build a Shiki highlighter or MDX registry at module scope without measuring.
- **Bundle: 3 MB gzip (Free) / 10 MB gzip (Paid)**, 64 MB uncompressed. Check with `wrangler deploy --outdir bundled/ --dry-run`. This is the line Prisma's WASM engine (~785 KB gzip) crosses badly on Free.
- **Request body: 100 MB** (Free/Pro), 200 MB Business. **Response body: no enforced limit** (CDN cache caps at 512 MB). Headers 128 KB total, URL 16 KB.
- HTTP duration: no limit while the client is connected; `ctx.waitUntil()` extends work **up to 30 s** past the response.

**D1**
- **Queries per Worker invocation: 1000 (Paid) / 50 (Free).**
- **Max bound parameters per query: 100.** ← Chunk bulk inserts; a 30-column table means ≤3 rows per `INSERT ... VALUES`.
- **Max string / BLOB / row size: 2,000,000 bytes (2 MB).** A plan's Markdown body must stay under 2 MB — for anything larger, store in R2 and keep a pointer in D1.
- **Max SQL statement length: 100,000 bytes (100 KB)** — applies per statement *inside* a `batch()` too.
- Max 100 columns per table; max 32 args per SQL function; **LIKE/GLOB pattern ≤ 50 bytes**; max SQL query duration 30 s (also caps the whole batch).
- Database size 10 GB (Paid) / 500 MB (Free), and **10 GB cannot be raised**.
- **Each D1 database is single-threaded** and processes queries one at a time; throughput ≈ 1/avg-query-duration. Overload → `"overloaded"` error.
- **No interactive transactions** — auto-commit only; `db.batch()` is your transaction.
- Billing is by **rows read/written**, so an unindexed `WHERE` or a leading-wildcard `LIKE` costs money proportional to table size.

### sources

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/d1/driver.ts

#### line_start

38

#### line_end

49

#### excerpt

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends AnyD1Database = AnyD1Database,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): DrizzleD1Database<TSchema> & {
	$client: TClient;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/columns/integer.ts

#### line_start

143

#### line_end

155

#### excerpt

override mapFromDriverValue(value: number): Date {
		if (this.config.mode === 'timestamp') {
			return new Date(value * 1000);
		}
		return new Date(value);
	...
		const unix = value.getTime();
		if (this.config.mode === 'timestamp') {
			return Math.floor(unix / 1000);
		}
		return unix;

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/columns/integer.ts

#### line_start

195

#### line_end

197

#### excerpt

override mapFromDriverValue(value: number): boolean {
		return Number(value) === 1;
	}

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/columns/text.ts

#### line_start

99

#### line_end

114

#### excerpt

export class SQLiteTextJson<T extends ColumnBaseConfig<'json', 'SQLiteTextJson'>>
	...
	getSQLType(): string {
		return 'text';
	...
	override mapFromDriverValue(value: string): T['data'] {
		return JSON.parse(value);
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/columns/text.ts

#### line_start

30

#### line_end

33

#### excerpt

constructor(name: T['name'], config: SQLiteTextConfig<'text', T['enumValues'], T['length']>) {
		super(name, 'string', 'SQLiteText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/columns/blob.ts

#### line_start

167

#### line_end

172

#### excerpt

/**
 *  It's recommended to use `text('...', { mode: 'json' })` instead of `blob` in JSON mode, because it supports JSON functions:
 * >All JSON functions currently throw an error if any of their arguments are BLOBs because BLOBs are reserved for a future enhancement in which BLOBs will store the binary encoding for JSON.
 *
 * https://www.sqlite.org/json1.html
 */

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/d1/session.ts

#### line_start

111

#### line_end

129

#### excerpt

override async transaction<T>(
		transaction: (tx: D1Transaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new D1Transaction('async', this.dialect, this, this.schema);
		await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = await transaction(tx);
			await this.run(sql`commit`);

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-kit/src/cli/validations/sqlite.ts

#### line_start

12

#### line_end

17

#### excerpt

object({
		driver: literal('d1-http'),
		accountId: string().min(1),
		databaseId: string().min(1),
		token: string().min(1),
	}),

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-kit/src/cli/validations/common.ts

#### line_start

64

#### line_end

68

#### excerpt

export const sqliteDriversLiterals = [
	literal('d1-http'),
	literal('expo'),
	literal('durable-sqlite'),
] as const;

#### repo

drizzle-team/drizzle-orm

#### path

drizzle-orm/src/sqlite-core/table.ts

#### line_start

66

#### line_end

68

#### excerpt

extraConfig?: (
			...
		) => SQLiteTableExtraConfigValue[],

#### repo

better-auth/better-auth

#### path

docs/content/docs/adapters/drizzle.mdx

#### line_start

10

#### line_end

32

#### excerpt

To use the Drizzle adapter, you need to install the `@better-auth/drizzle-adapter` package:

```package-install
@better-auth/drizzle-adapter
```
...
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite", // or "pg" or "mysql"
  }),
});

#### repo

better-auth/better-auth

#### path

docs/content/docs/integrations/tanstack.mdx

#### line_start

51

#### line_end

58

#### excerpt

import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export const auth = betterAuth({
    //...your config
    plugins: [tanstackStartCookies()] // make sure this is the last plugin in the array
})

#### repo

better-auth/better-auth

#### path

docs/content/docs/integrations/tanstack.mdx

#### line_start

92

#### line_end

101

#### excerpt

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    return session;
});

#### repo

better-auth/better-auth

#### path

docs/content/docs/concepts/database.mdx

#### line_start

61

#### line_end

63

#### excerpt

<Callout type="warn">
  `getMigrations` only works with the built-in Kysely adapter (SQLite/D1, PostgreSQL, MySQL, MSSQL). It does **not** work with Prisma or Drizzle ORM adapters — use CLI migrations with those ORMs instead.
</Callout>

#### repo

better-auth/better-auth

#### path

docs/content/docs/authentication/github.mdx

#### line_start

11

#### line_end

14

#### excerpt

Make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/github` for local development. For production, you should set it to the URL of your application. If you change the base path of the auth routes, you should update the redirect URL accordingly.

Important: You MUST include the user:email scope in your GitHub app.

#### repo

cloudflare/cloudflare-docs

#### path

workers/runtime-apis/bindings/index.md

#### line_start

110

#### line_end

112

#### excerpt

As a result, you must be careful when "polluting" global scope with derivatives of your bindings. Anything you create there might continue to exist despite making changes to any underlying bindings. ... The correct approach would be to create a new client instance for each request.

#### repo

cloudflare/cloudflare-docs

#### path

workers/framework-guides/web-apps/tanstack-start/index.md

#### line_start

392

#### line_end

400

#### excerpt

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const getData = createServerFn().handler(() => {
	// Access bindings via env
	// For example: env.MY_KV, env.MY_BUCKET, env.AI, etc.
});

#### repo

cloudflare/cloudflare-docs

#### path

d1/platform/limits/index.md

#### line_start

20

#### line_end

30

#### excerpt

| Queries per Worker invocation (read subrequest limits) | 1000 (Workers Paid) / 50 (Free) |
| Maximum number of columns per table | 100 |
| Maximum string, BLOB or table row size | 2,000,000 bytes (2 MB) |
| Maximum SQL statement length | 100,000 bytes (100 KB) |
| Maximum bound parameters per query | 100 |
| Maximum characters (bytes) in a LIKE or GLOB pattern | 50 bytes |
| Maximum SQL query duration | 30 seconds |

#### repo

cloudflare/cloudflare-docs

#### path

workers/platform/limits/index.md

#### line_start

25

#### line_end

33

#### excerpt

| CPU time | 10 ms | 5 min |
| Memory | 128 MB | 128 MB |
| Subrequests | 50/request | 10,000/request |
| Simultaneous outgoing connections/request | 6 | 6 |
| Environment variables | 64/Worker | 128/Worker |
| Worker size | 3 MB | 10 MB |
| Worker startup time | 1 second | 1 second |

#### repo

cloudflare/cloudflare-docs

#### path

d1/worker-api/d1-database/index.md

#### line_start

88

#### line_end

90

#### excerpt

Sends multiple SQL statements inside a single call to the database. ... D1 operates in auto-commit. Our implementation guarantees that each statement in the list will execute and commit, sequentially, non-concurrently.

Batched statements are SQL transactions. If a statement in the sequence fails, then an error is returned for that specific statement, and it aborts or rolls back the entire sequence.

#### repo

cloudflare/cloudflare-docs

#### path

d1/sql-api/sql-statements/index.md

#### line_start

24

#### line_end

28

#### excerpt

D1 supports a subset of SQLite extensions for added functionality, including:

* FTS5 module for full-text search (including `fts5vocab`).
* JSON extension for JSON functions and operators.
* Math functions.

#### repo

cloudflare/cloudflare-docs

#### path

d1/best-practices/use-indexes/index.md

#### line_start

126

#### line_end

126

#### excerpt

WHERE column LIKE '%term%' (leading wildcard) ... A leading % prevents a regular B-tree index from optimizing LIKE, so the query usually requires a full scan. ... For arbitrary substring searches, consider FTS5 with the trigram tokenizer, which can optimize patterns containing at least three consecutive non-wildcard Unicode characters. FTS5 indexes increase storage and write costs, so benchmark them for your workload.

#### repo

cloudflare/cloudflare-docs

#### path

d1/reference/migrations/index.md

#### line_start

37

#### line_end

70

#### excerpt

By default, migrations are created in the `migrations/` folder in your Worker project directory. Creating migrations will keep a record of applied migrations in the `d1_migrations` table found in your database.
...
By default, `wrangler d1 migrations apply` looks for top-level `.sql` files inside `migrations_dir`.

#### repo

cloudflare/cloudflare-docs

#### path

workers/configuration/secrets/index.md

#### line_start

88

#### line_end

100

#### excerpt

Put secrets for use in local development in either a `.dev.vars` file or a `.env` file, in the same directory as the Wrangler configuration file. ... Choose to use either `.dev.vars` or `.env` but not both. If you define a `.dev.vars` file, then values in `.env` files will not be included in the `env` object during local development.

#### repo

cloudflare/cloudflare-docs

#### path

workers/wrangler/configuration/index.md

#### line_start

1869

#### line_end

1894

#### excerpt

The `secrets` configuration property lets you declare the secret names your Worker requires in your Wrangler configuration file. ... "secrets": { "required": ["API_KEY", "DB_PASSWORD"] } ... When `secrets` is defined, `wrangler deploy` and `wrangler versions upload` validate that all secrets in `secrets.required` are configured on the Worker before the operation succeeds.

#### repo

cloudflare/cloudflare-docs

#### path

workers/vite-plugin/reference/api/index.md

#### line_start

51

#### line_end

52

#### excerpt

`persistState` `boolean | { path: string }` optional — An optional override for state persistence. By default, state is persisted to `.wrangler/state`.

#### repo

cloudflare/cloudflare-docs

#### path

d1/best-practices/local-development/index.md

#### line_start

118

#### line_end

120

#### excerpt

By default, in Wrangler v3 and above, data is persisted across each run of `wrangler dev`. ... Use `wrangler dev --persist-to=/path/to/file` to persist data to a specific location.

#### repo

prisma/docs

#### path

orm/v6/overview/databases/cloudflare-d1

#### line_start

10

#### line_end

14

#### excerpt

Prisma ORM support for Cloudflare D1 is currently in Preview. ... With Prisma ORM 7, the recommended approach for managing database schema migrations with Cloudflare D1 is to use the Wrangler CLI combined with `prisma migrate diff`.

### api

#### signature

drizzle<TSchema extends Record<string, unknown> = Record<string, never>, TClient extends AnyD1Database = AnyD1Database>(client: TClient, config?: DrizzleConfig<TSchema>): DrizzleD1Database<TSchema> & { $client: TClient }

#### description

`drizzle-orm/d1` factory. Takes the raw D1 binding (`env.DB`). Performs no I/O, so it is legal outside a request context — but Cloudflare advises not caching binding-derived clients in module scope.

#### signature

DrizzleD1Database.batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(batch: T): Promise<BatchResponse<T>>

#### description

The only transactional primitive available on D1. Maps to `D1Database.batch()`, which is a real SQL transaction. Use instead of `db.transaction()`.

#### signature

sqliteTable(name: string, columns: TColumnsMap, extraConfig?: (self) => SQLiteTableExtraConfigValue[])

#### description

Table builder from `drizzle-orm/sqlite-core`. Third arg returns an ARRAY of indexes/checks/unique/pk constraints.

#### signature

text(name: string, config?: { mode?: 'text' | 'json'; enum?: readonly string[]; length?: number })

#### description

`mode:'json'` → SQL type `text`, JSON.stringify/parse round-trip. `enum` is TypeScript-only; emits no CHECK constraint.

#### signature

integer(name: string, config?: { mode: 'number' | 'boolean' | 'timestamp' | 'timestamp_ms' })

#### description

`boolean` → 0/1 INTEGER. `timestamp` → INTEGER Unix SECONDS. `timestamp_ms` → INTEGER milliseconds. No native SQLite datetime type.

#### signature

check(name: string, value: SQL): CheckBuilder

#### description

From `drizzle-orm/sqlite-core`. The only way to get DB-level enforcement of an 'enum-ish' text column.

#### signature

defineConfig({ dialect: 'sqlite', schema: string, out: string, driver?: 'd1-http' | 'expo' | 'durable-sqlite', dbCredentials?: { accountId: string; databaseId: string; token: string }, casing?: 'snake_case' | 'camelCase' })

#### description

`drizzle.config.ts` shape from `drizzle-kit`. `driver`/`dbCredentials` are only consumed by push/pull/studio; `drizzle-kit generate` needs neither.

#### signature

betterAuth({ database: drizzleAdapter(db, { provider: 'sqlite', schema }), secret, baseURL, socialProviders: { github: { clientId, clientSecret } }, session: { cookieCache: { enabled: true, maxAge } }, plugins: [tanstackStartCookies()] })

#### description

better-auth instance for D1. `tanstackStartCookies()` must be the last plugin. `drizzleAdapter` comes from `@better-auth/drizzle-adapter`.

#### signature

auth.api.getSession({ headers: getRequestHeaders() }): Promise<{ session, user } | null>

#### description

Reading the current session inside a TanStack Start server function. `getRequestHeaders` is from `@tanstack/react-start/server`.

#### signature

auth.handler(request: Request): Promise<Response>

#### description

Mount at `src/routes/api/auth/$.ts` under `server.handlers.GET` and `.POST`.

#### signature

import { env } from 'cloudflare:workers'

#### description

Access D1/KV/R2 bindings and secrets from any server-side module, including TanStack Start server functions. Vars/secrets readable at top level; binding METHODS may only be called inside a request context.

#### signature

npx wrangler d1 migrations apply <DATABASE> [--local | --remote | --preview] [--persist-to <dir>]

#### description

Applies top-level `.sql` files from `migrations_dir`, tracking them in the `d1_migrations` table. `--local` targets `.wrangler/state`, which `vite dev` also uses.

#### signature

npx wrangler secret put <KEY> | npx wrangler secret delete <KEY> | npx wrangler deploy --secrets-file <file>

#### description

Production secret management. `secret put` immediately creates and deploys a new Worker version; use `wrangler versions secret put` with gradual deployments.

#### signature

npx wrangler types [PATH=./worker-configuration.d.ts] [--env-interface Env] [--include-runtime]

#### description

Generates the `Env` interface from bindings + `secrets.required`, plus runtime types keyed to your compatibility_date/flags. Wire as `"cf-typegen": "wrangler types"`.

### version

drizzle-orm 0.45.2 (dist-tag latest; rc = 1.0.0-rc.4 — avoid) · drizzle-kit 0.31.10 · better-auth 1.6.27 · @better-auth/drizzle-adapter 1.6.27 · better-auth CLI = `auth@1.6.27` · wrangler 4.121.0 · @tanstack/react-start 1.168.42 · @cloudflare/workers-types 5.20260811.1 · (rejected: @prisma/adapter-d1 7.9.1 / prisma 7.9.1, @auth/core 0.41.3, @auth/d1-adapter 1.11.3). Cloudflare docs read 2026-08-12.

### breaking_changes

better-auth ≥1.x: the Drizzle adapter moved OUT of the core package into `@better-auth/drizzle-adapter`. `better-auth/adapters/drizzle` still resolves but is a one-line `export * from "@better-auth/drizzle-adapter"` — install the standalone package and import from it directly.

better-auth CLI is invoked as `npx auth@latest generate` (npm package `auth`, 1.6.27). The older `@better-auth/cli` package is stale at 1.4.21.

drizzle-kit ≥0.21: `dialect` is mandatory and `driver` is now optional/narrow — `driver: 'd1-http'` no longer implies the dialect. For SQLite the only legal drivers are `d1-http`, `expo`, `durable-sqlite` (plus `turso` via url).

drizzle-orm 1.0 RC changes Relational Queries (v1→v2) and other APIs. Because `@better-auth/drizzle-adapter@1.6.27` pins peer `drizzle-orm: ^0.45.2`, the whole project must stay on 0.45.x until better-auth bumps.

`sqliteTable`'s third argument returning an object is the legacy overload; current code returns an array of constraint builders.

Prisma 7 dropped the Cloudflare D1 page from its current docs tree — the only D1 guidance lives under `/docs/orm/v6/` and is still marked Preview.

### caveats

NO interactive transactions on D1. Drizzle's `SQLiteD1Session.transaction()` literally emits `begin`/`commit`/`rollback`, which D1 rejects (it is auto-commit only). Use `db.batch([...])`. This is the single most likely thing for a coding agent to get wrong.

`text(col, { enum: [...] })` produces NO database constraint — it is a TypeScript union only. Pair it with `check()` if you want enforcement.

`integer({ mode: 'timestamp' })` stores Unix SECONDS, `timestamp_ms` stores milliseconds. Mixing the two across tables silently produces dates in 1970 or the year 56000.

Max 100 bound parameters per D1 query. Multi-row inserts must be chunked; a wide table means only 2-3 rows per INSERT.

Max row/string size is 2 MB. Markdown plan bodies above that must go to R2 with a pointer row in D1.

`wrangler d1 export` does not support databases containing virtual tables — adopting FTS5 permanently complicates backups/exports.

LIKE/GLOB patterns are capped at 50 bytes, and a leading `%` forces a full table scan that D1 bills per row read.

better-auth needs `nodejs_compat` (or at minimum `nodejs_als`) in `compatibility_flags` for AsyncLocalStorage; without it, auth fails at runtime, not at build.

Setting `secondaryStorage` moves sessions OUT of D1 into that store unless you also set `session.storeSessionInDatabase: true`. Prefer plain D1 + `session.cookieCache` to avoid a D1 read per request.

With `session.cookieCache` enabled, revoked sessions stay valid on other devices until `maxAge` elapses.

`.dev.vars` and `.env` are mutually exclusive — if `.dev.vars` exists, `.env` is ignored entirely in local dev.

Cloudflare warns against module-scope clients derived from bindings (isolates can be reused across binding-only redeploys with a stale client). `drizzle(env.DB)` is cheap and does no I/O, so use a `getDb()` factory rather than an exported singleton.

GitHub Apps (as opposed to OAuth Apps) additionally require the 'Email addresses: Read-only' account permission, or sign-in fails with `email_not_found`.

Worker global scope must finish executing in 1 second — do not build Shiki highlighters or MDX component registries at module load without measuring.

UNVERIFIED: the exact declaration form `wrangler types` uses to type `env` imported from `cloudflare:workers` (docs confirm an `Env` interface is generated into `worker-configuration.d.ts` and that it must be added to `tsconfig.compilerOptions.types`; the `Cloudflare.Env` namespace wiring was not read from source).

UNVERIFIED: whether `drizzle-kit studio` works against a LOCAL D1 sqlite file under `.wrangler/state` without extra configuration. Remote studio via `driver: 'd1-http'` is verified from the config schema.

UNVERIFIED: interaction of `drizzle-kit`'s own `__drizzle_migrations` journal with wrangler's `d1_migrations` table if you ever run `drizzle-kit migrate`. Stick to `drizzle-kit generate` + `wrangler d1 migrations apply` and only one journal is in play.


---

# Runtime MDX rendering on Workers

### answer

# MDX-on-Workers: verified findings

All claims below were executed on **real workerd** (`wrangler 4.120.0 dev --local`, `compatibility_date 2026-06-01`, **no `nodejs_compat` flag needed**). Versions: `@mdx-js/mdx@3.1.1`, `hast-util-to-jsx-runtime@2.3.6`, `unified@11.0.5`, `remark-parse@11.0.0`, `remark-mdx@3.1.1`, `remark-rehype@11.1.2`, `mdast-util-to-hast@13.2.1`, `mdast-util-mdx-jsx@3.2.0`, `remark-gfm@4.0.1`, `shiki@4.4.3`, `mermaid@11.16.1`, `react@19.2.8`, `next-mdx-remote@6.0.0`.

---

## 1. Runtime MDX compilation (`@mdx-js/mdx` API)

Exact exports (`packages/mdx/index.js`):

```js
export {compile, compileSync} from './lib/compile.js'
export {createProcessor} from './lib/core.js'
export {evaluate, evaluateSync} from './lib/evaluate.js'
export {nodeTypes} from './lib/node-types.js'
export {run, runSync} from './lib/run.js'
```

- `compile(file, options?) => Promise<VFile>` — MDX string → **JS source string**. No eval. Workers-safe by itself, but useless alone.
- `run(code, runOptions) => Promise<MDXModule>` — requires `outputFormat: 'function-body'`.
- `evaluate(file, options) => Promise<MDXModule>` — literally `run(await compile(file, compiletime), runtime)`.

Runtime args (`RunOptions`), enforced in `resolveEvaluateOptions`: `Fragment` **required**; production needs `jsx` + `jsxs`; `development: true` needs `jsxDEV`; `useMDXComponents` only if compiled with `providerImportSource`. So the canonical call is:

```js
import {evaluate} from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'   // supplies {Fragment, jsx, jsxs}
const {default: MDXContent} = await evaluate(source, {...runtime, baseUrl: import.meta.url})
// render: MDXContent({components}) — call it, don't <MDXContent/>, per mdx's own perf note
```

**This does not run on Workers.** See §2.

---

## 2. Cloudflare Workers viability — DECISION

### `evaluate`/`run` are dead on Workers. Confirmed, not inferred.

`lib/run.js` builds an `AsyncFunction`:

```js
const AsyncFunction = Object.getPrototypeOf(run).constructor
export async function run(code, options) { return new AsyncFunction(String(code))(options) }
export function runSync(code, options) { return new Function(String(code))(options) }
```

Cloudflare forbids exactly this (`workers/runtime-apis/web-standards/`: "For security reasons, the following are not allowed: `eval()`, `new Function`, `WebAssembly.compile`, `WebAssembly.instantiate` with a buffer parameter"). Live workerd result:

```json
{ "mdxEvaluate":   "FAILED: EvalError: Code generation from strings disallowed for this context",
  "rawNewFunction":"FAILED: EvalError: Code generation from strings disallowed for this context" }
```

**`next-mdx-remote` (option b) is also dead** — both entrypoints use the Function constructor. `dist/rsc.js` (the server/RSC path):

```js
const hydrateFn = Reflect.construct(Function, keys.concat(`${compiledSource}`));
const Content = hydrateFn.apply(hydrateFn, values).default;
```

`dist/index.js` (client path) does the same. `Reflect.construct(Function, …)` is the Function constructor → same `EvalError`. It is also Next-coupled. Rule it out.

### ✅ RECOMMENDATION: option (c) — remark/rehype → hast → `hast-util-to-jsx-runtime`, with a **non-eval `createEvaluater`**

The non-obvious part: `hast-util-to-jsx-runtime` handles `mdxJsxFlowElement`/`mdxJsxTextElement` natively, but for a **capitalized** name it builds an ESTree `Identifier` and delegates to an evaluater (`findComponentFromName`, `allowExpression: true`):

```js
result = isIdentifierName(name) && !/^[a-z]/.test(name) ? {type:'Identifier', name} : {type:'Literal', value:name}
// Only literals can be passed in `components` currently.
if (result.type === 'Literal') { return own.call(state.components, name) ? state.components[name] : name }
if (state.evaluater) { return state.evaluater.evaluateExpression(result) }
crashEstree(state)  // "Cannot handle MDX estrees without `createEvaluater`"
```

So `<Decision/>` **requires** a `createEvaluater`. The insight that makes this Workers-safe: `Evaluater` is just `{evaluateExpression(expr), evaluateProgram(prog)}` — nothing forces it to eval. Implement it as a **registry lookup over the ESTree node**. Pure JS, zero code generation, and it doubles as the strict-mode enforcement point.

```js
// mdx-render.js — verified running on workerd
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkRehype from 'remark-rehype'
import {toJsxRuntime} from 'hast-util-to-jsx-runtime'
import {Fragment, jsx, jsxs} from 'react/jsx-runtime'

// inline; do NOT `import {nodeTypes} from '@mdx-js/mdx'` (drags the whole compiler into the bundle)
const MDX_NODES = ['mdxFlowExpression','mdxJsxFlowElement','mdxJsxTextElement','mdxTextExpression','mdxjsEsm']

const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkMdx)
  .use(remarkRehype, {passThrough: MDX_NODES})   // MUST pass through, see caveats

const evaluater = (registry) => () => ({
  evaluateExpression(node) {
    if (node.type === 'Identifier') {
      if (Object.hasOwn(registry, node.name)) return registry[node.name]
      throw new Error(`Unknown MDX component <${node.name}>. Allowed: ${Object.keys(registry).sort().join(', ')}`)
    }
    if (node.type === 'Literal') return node.value          // allows count={3}; drop this line to forbid
    throw new Error(`JS expressions are not allowed in plan documents (${node.type}).`)
  },
  evaluateProgram() { throw new Error('import/export are not allowed in plan documents.') }
})

export function renderMdx(source, registry) {
  const hast = pipeline.runSync(pipeline.parse(source))
  return toJsxRuntime(hast, {Fragment, jsx, jsxs, components: registry, createEvaluater: evaluater(registry)})
}
```

workerd output for `## Hi\n\n<Decision owner="@srujan" recommended>\nShip **it**.\n</Decision>`:

```html
<h2>Hi</h2>
<section data-owner="@srujan" data-rec="true"><p>Ship <strong>it</strong>.</p></section>
```

### On option (a) — precompiled AST in the DB

Not a different architecture; it is the **cache layer for the same renderer**. The hast tree is plain JSON. Verified round-trip produces byte-identical HTML:

```js
// write time: const cached = JSON.stringify(pipeline.runSync(pipeline.parse(src)))
// read time:  toJsxRuntime(JSON.parse(cached), {Fragment, jsx, jsxs, components, createEvaluater})
```

Measured on a ~14 KB document: **parse+transform 35.6 ms vs `JSON.parse` 2.45 ms (~14×)**. Recommendation: render live from the string (correctness, no migration risk), and add the hast-JSON column as a pure cache keyed by a content hash once documents get large. Do not adopt (a) as the primary contract.

---

## 3. Component registry + loud failures

`components` is a plain object keyed by tag/component name; it covers both HTML tags and MDX components:

```js
const registry = {
  h2: PlanHeading, a: PlanLink, pre: CodeBlock,      // HTML overrides
  Decision, Tradeoff, Mermaid                         // custom components
}
```

- **Capitalized unknowns already fail loudly** via the evaluater above: `THREW: Unknown MDX component <Bogus>. Allowed: Decision, Tradeoff` (verified on workerd).
- **The loophole**: a *lowercase* unknown name takes the `Literal` branch and falls back to the raw string, rendering silently. Verified: `<decision owner="x">hi</decision>` → `<p><decision owner="x">hi</decision></p>`. No error.

Close it with a strict `components` Proxy. `findComponentFromName` gates on `own.call(state.components, name)`, i.e. `hasOwnProperty` — so you must trap `getOwnPropertyDescriptor`, not `has`:

```js
const HTML = new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','li','em','strong','code','pre','a',
  'blockquote','hr','table','thead','tbody','tr','td','th','img','br','del','input','section','span','div'])

export const strict = (base) => new Proxy(base, {
  getOwnPropertyDescriptor(t, k) {
    if (typeof k !== 'string' || Object.hasOwn(t, k)) return Reflect.getOwnPropertyDescriptor(t, k)
    if (HTML.has(k)) return undefined                              // render natively
    return {configurable: true, enumerable: true, value: undefined} // claim it -> forces get()
  },
  get(t, k) {
    if (Object.hasOwn(t, k)) return t[k]
    if (typeof k === 'string' && !HTML.has(k)) throw new Error(`Unknown MDX element <${k}>`)
  }
})
```

Verified: `<decision/>` and `<blink/>` throw; `<Decision>ok</Decision>` and plain markdown render normally. Belt-and-braces — also run the §5 linter at write time so authors get the error on save, not on read.

---

## 4. How props arrive

MDX JSX elements bypass `property-information` entirely (`createJsxElementProps`): **attribute names reach the component verbatim** — no `class`→`className` rewriting, no kebab mangling.

```js
value = attribute.value === null ? true : attribute.value   // bare attribute -> boolean true
props[name] = value
```

For `<Decision owner="@x" severity="high" recommended>`, the component receives exactly:

```js
{owner: '@x', severity: 'high', recommended: true, children: <ReactNode>}
```

- Values are **always strings** unless bare (`true`). `count="3"` is `'3'`, not `3`. Coerce in the component or the linter.
- `{...}` expression attributes and `{...spread}` route through `evaluateExpression` — the evaluater above accepts `Literal` (`count={3}` → `3`) and rejects everything else. Verified: `count={1+2}` → `FAILED: Error: Unsupported MDX expression (BinaryExpression)`.
- Add `passNode: true` if a component needs the source node (position info for error links).
- Note the asymmetry: plain **HTML** elements *do* go through `property-information` + `elementAttributeNameCase: 'react'` (default), so `class` → `className` there.

---

## 5. Parsing without rendering (lint / extract, no React)

Only `unified` + `remark-parse` + `remark-mdx`. `mdast-util-mdx-jsx` is a transitive dependency of `remark-mdx` supplying the node types; you import it only for TypeScript types. Verified running inside workerd.

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'

const parser = unified().use(remarkParse).use(remarkMdx)

export function outline(source) {
  const tree = parser.parse(source)                    // mdast Root — synchronous, no run() needed
  return tree.children.map((node) => {                 // top-level blocks only
    if (node.type === 'mdxJsxFlowElement') return {
      kind: 'component',
      name: node.name,                                 // 'Decision' | null (fragment <>)
      attributes: Object.fromEntries(node.attributes
        .filter((a) => a.type === 'mdxJsxAttribute')   // vs 'mdxJsxExpressionAttribute' ({...spread})
        .map((a) => [a.name, a.value === null ? true
          : typeof a.value === 'object' ? {expression: a.value.value} : a.value])),
      line: node.position.start.line
    }
    if (node.type === 'heading') return {kind: 'heading', depth: node.depth, line: node.position.start.line}
    return {kind: node.type, line: node.position.start.line}
  })
}
```

Actual workerd output:

```json
[{"kind":"heading","depth":2,"line":1},
 {"kind":"component","name":"Decision","attributes":{"owner":"@srujan","recommended":true},"line":3},
 {"kind":"paragraph","line":7}]
```

Attribute shapes: `mdxJsxAttribute.value` is `string` | `null` (bare) | `{type:'mdxJsxAttributeValueExpression', value: '<js source>'}`. Use `unist-util-visit` for nested walks. `position.start.line` gives authors precise error locations.

---

## 6. Shiki on Workers

**Use the JavaScript regex engine. The Oniguruma WASM path is impossible on Workers.** Verified both ways:

```json
{ "shiki":           "<pre class=\"shiki github-dark\" …>  ✅",
  "shikiOniguruma":  "FAILED: CompileError: WebAssembly.instantiate(): Wasm code generation disallowed by embedder" }
```

`shiki/wasm` re-exports `@shikijs/engine-oniguruma/wasm-inlined`, whose default export is `declare const binary: ArrayBuffer` — an ArrayBuffer, so `createOnigurumaEngine(binary)` hits `WebAssembly.instantiate` with a buffer, explicitly banned by Cloudflare. Don't fight it.

```js
import {createHighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from '@shikijs/engine-javascript'
import ts from '@shikijs/langs/typescript'
import githubDark from '@shikijs/themes/github-dark'

let hl
export async function getHighlighter() {
  return hl ??= await createHighlighterCore({
    themes: [githubDark],
    langs: [ts],                                  // static imports = bundled, no fs/network
    engine: createJavaScriptRegexEngine()
  })
}
```

Signatures: `createHighlighterCore(options) => Promise<HighlighterCore>`, `createJavaScriptRegexEngine(options?) => RegexEngine`, `createOnigurumaEngine(options?) => Promise<RegexEngine>`.

Drop it straight into the same unified pipeline via `@shikijs/rehype/core` — `rehypeShikiFromHighlighter(highlighter, options)` takes a pre-built highlighter, so it inherits the JS engine:

```js
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkMdx)
  .use(remarkRehype, {passThrough: MDX_NODES})
  .use(rehypeShikiFromHighlighter, await getHighlighter(), {theme: 'github-dark'})
// async now: await pipeline.run(pipeline.parse(source))
```

Verified end-to-end on workerd (Shiki + GFM tables + custom component in one pass):

```html
<pre class="shiki github-dark" style="background-color:#24292e;…"><code><span class="line">…</span></code></pre>
<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
<p><section data-o="@z">hi</section></p>
```

Caveat: the JS engine emulates Oniguruma via `oniguruma-to-es`; a few exotic grammars have unsupported patterns and throw at load. Pin your language list, and set `forgiving: true` only if a needed grammar trips.

---

## 7. Mermaid — client-only, confirmed

Mermaid **imports** cleanly on Workers but **cannot render** there. Verified:

```json
{ "mermaid": "FAILED: ReferenceError: document is not defined" }
```

(`mermaid@11.16.1`, calling `mermaid.render('id','graph TD;A-->B;')` inside the Worker.) It measures text via real DOM nodes; there is no Workers-viable server path. Render after hydration:

```tsx
// Mermaid.tsx — must be excluded from SSR
import {useEffect, useRef, useState} from 'react'

export function Mermaid({chart}: {chart: string}) {
  const id = useRef(`m${Math.random().toString(36).slice(2)}`)
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const mermaid = (await import('mermaid')).default   // dynamic: keeps it out of the server bundle
      mermaid.initialize({startOnLoad: false, securityLevel: 'strict'})
      try {
        const {svg} = await mermaid.render(id.current, chart)
        if (alive) setSvg(svg)
      } catch (e) { if (alive) setError(String(e)) }
    })()
    return () => { alive = false }
  }, [chart])

  if (error) return <pre className="mermaid-error">{error}</pre>
  if (!svg) return <pre className="mermaid-pending">{chart}</pre>   // SSR + pre-hydration fallback
  return <div dangerouslySetInnerHTML={{__html: svg}} />
}
```

Key points: **dynamic `import('mermaid')` inside `useEffect`** — a static top-level import pulls ~1 MB into the Worker bundle and risks module-init DOM access. Render the raw diagram source as the SSR fallback so agents/curl still get the text. `securityLevel: 'strict'` since diagram source is user content. Give each instance a unique id — mermaid injects temp DOM keyed by it.

---

## Recommended dependency set

```
unified remark-parse remark-gfm remark-mdx remark-rehype
hast-util-to-jsx-runtime
shiki @shikijs/engine-javascript @shikijs/langs @shikijs/themes @shikijs/rehype
mermaid            # client-only, dynamic import
```

Not needed at runtime, and actively harmful in the Worker bundle: `@mdx-js/mdx`, `@mdx-js/react`, `next-mdx-remote`.

### sources

#### repo

github.com/mdx-js/mdx@685627a (v3.1.1)

#### path

packages/mdx/lib/run.js

#### line_start

6

#### line_end

26

#### excerpt

/** @type {new (code: string, ...args: Array<unknown>) => Function} **/
const AsyncFunction = Object.getPrototypeOf(run).constructor
...
export async function run(code, options) {
  return new AsyncFunction(String(code))(options)
}

#### repo

github.com/mdx-js/mdx@685627a (v3.1.1)

#### path

packages/mdx/lib/evaluate.js

#### line_start

45

#### line_end

48

#### excerpt

export async function evaluate(file, options) {
  const {compiletime, runtime} = resolveEvaluateOptions(options)
  return run(await compile(file, compiletime), runtime)
}

#### repo

github.com/mdx-js/mdx@685627a (v3.1.1)

#### path

packages/mdx/lib/util/resolve-evaluate-options.js

#### line_start

69

#### line_end

76

#### excerpt

if (!Fragment) throw new Error('Expected `Fragment` given to `evaluate`')
  if (development) {
    if (!jsxDEV) throw new Error('Expected `jsxDEV` given to `evaluate`')
  } else {
    if (!jsx) throw new Error('Expected `jsx` given to `evaluate`')
    if (!jsxs) throw new Error('Expected `jsxs` given to `evaluate`')
  }

#### repo

github.com/mdx-js/mdx@685627a (v3.1.1)

#### path

packages/mdx/lib/node-types.js

#### line_start

5

#### line_end

11

#### excerpt

export const nodeTypes = /** @type {const} */ ([
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm'
])

#### repo

developers.cloudflare.com

#### path

workers/runtime-apis/web-standards/

#### line_start

1

#### line_end

1

#### excerpt

For security reasons, the following are not allowed: `eval()`, `new Function`, WebAssembly.compile, WebAssembly.compileStreaming, `WebAssembly.instantiate` with a buffer parameter, WebAssembly.instantiateStreaming

#### repo

npm:hast-util-to-jsx-runtime@2.3.6

#### path

lib/index.js

#### line_start

670

#### line_end

700

#### excerpt

function findComponentFromName(state, name, allowExpression) {
  ...
    result = isIdentifierName(name) && !/^[a-z]/.test(name) ? {type: 'Identifier', name} : {type: 'Literal', value: name}
  // Only literals can be passed in `components` currently.
  if (result.type === 'Literal') {
    const name = result.value
    return own.call(state.components, name) ? state.components[name] : name
  }
  if (state.evaluater) { return state.evaluater.evaluateExpression(result) }
  crashEstree(state)

#### repo

npm:hast-util-to-jsx-runtime@2.3.6

#### path

lib/index.js

#### line_start

503

#### line_end

521

#### excerpt

} else {
        value = attribute.value === null ? true : attribute.value
      }
      // Assume a prop.
      props[name] = /** @type {Props[keyof Props]} */ (value)

#### repo

npm:hast-util-to-jsx-runtime@2.3.6

#### path

lib/types.d.ts

#### line_start

94

#### line_end

103

#### excerpt

export interface Evaluater {
  /** Evaluate an expression. */
  evaluateExpression: EvaluateExpression
  /** Evaluate a program. */
  evaluateProgram: EvaluateProgram
}

#### repo

npm:mdast-util-to-hast@13.2.1

#### path

lib/state.js

#### line_start

260

#### line_end

275

#### excerpt

if (state.options.passThrough && state.options.passThrough.includes(type)) {
      ... return structuredClone(node)
    }
    const unknown = state.options.unknownHandler || defaultUnknownHandler

#### repo

npm:mdast-util-to-hast@13.2.1

#### path

lib/state.js

#### line_start

407

#### line_end

419

#### excerpt

function defaultUnknownHandler(state, node) {
  ... : {
          type: 'element',
          tagName: 'div',
          properties: {},
          children: state.all(node)
        }

#### repo

npm:next-mdx-remote@6.0.0

#### path

dist/rsc.js

#### line_start

25

#### line_end

27

#### excerpt

const hydrateFn = Reflect.construct(Function, keys.concat(`${compiledSource}`));
    const Content = hydrateFn.apply(hydrateFn, values).default;

#### repo

npm:shiki@4.4.3

#### path

dist/wasm.mjs

#### line_start

1

#### line_end

3

#### excerpt

import wasm_inlined_default from "@shikijs/engine-oniguruma/wasm-inlined";
export * from "@shikijs/engine-oniguruma/wasm-inlined";
export { wasm_inlined_default as default };

#### repo

npm:shiki@4.4.3

#### path

dist/onig.d.mts

#### line_start

1

#### line_end

1

#### excerpt

declare const binary: ArrayBuffer; export default binary;

#### repo

npm:@shikijs/core@4.4.3

#### path

dist/index.d.mts

#### line_start

90

#### line_end

99

#### excerpt

declare function createHighlighterCore(options: HighlighterCoreOptions<false>): Promise<HighlighterCore>;
...
declare function createHighlighterCoreSync(options: HighlighterCoreOptions<true>): HighlighterCore;

#### repo

npm:@shikijs/engine-javascript@4.4.3

#### path

dist/engine-compile-Bdn9ihA2.d.mts

#### line_start

61

#### line_end

61

#### excerpt

declare function createJavaScriptRegexEngine(options?: JavaScriptRegexEngineOptions): RegexEngine;

#### repo

npm:@shikijs/rehype@4.4.3

#### path

dist/core.d.mts

#### line_start

6

#### line_end

8

#### excerpt

declare function rehypeShikiFromHighlighter(highlighter: HighlighterGeneric<any, any>, options: RehypeShikiCoreOptions): Transformer<Root, Root>;
export { ..., rehypeShikiFromHighlighter as default };

#### repo

live workerd probe (wrangler 4.120.0, compat 2026-06-01, no nodejs_compat)

#### path

src/worker.mjs response

#### line_start

1

#### line_end

10

#### excerpt

{"safePipeline":"<h2>Hi</h2>\n<section data-owner=\"@srujan\" data-rec=\"true\"><p>Ship <strong>it</strong>.</p></section>","unknownComponent":"FAILED: Error: Unknown MDX component <Bogus>. Allowed: Decision, Tradeoff","exprAttrComplex":"FAILED: Error: Unsupported MDX expression (BinaryExpression)","rawNewFunction":"FAILED: EvalError: Code generation from strings disallowed for this context","mdxEvaluate":"FAILED: EvalError: Code generation from strings disallowed for this context","shikiOniguruma":"FAILED: CompileError: WebAssembly.instantiate(): Wasm code generation disallowed by embedder","mermaid":"FAILED: ReferenceError: document is not defined"}

#### repo

live workerd probe (full pipeline)

#### path

src/full.mjs response

#### line_start

1

#### line_end

3

#### excerpt

<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code><span class="line">…</span></code></pre>
<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
<p><section data-o="@z">hi</section></p>

#### repo

live Node probe (lowercase loophole)

#### path

src/proxy-test.mjs output

#### line_start

1

#### line_end

4

#### excerpt

"<decision/>" => THREW: Unknown MDX element <decision>
"<Decision>ok</Decision>" => <p><section>ok</section></p>
"# heading\n\ntext *x*" => <h1>heading</h1>\n<p>text <em>x</em></p>
"<blink/>" => THREW: Unknown MDX element <blink>

### api

#### signature

compile(file: Compatible, options?: CompileOptions): Promise<VFile>

#### description

@mdx-js/mdx. MDX string -> JS source string. Does NOT eval; safe on Workers by itself but produces code you then cannot run there.

#### signature

run(code: {toString(): string}, options: RunOptions): Promise<MDXModule>

#### description

@mdx-js/mdx. Executes function-body output via `new AsyncFunction`. Throws EvalError on Cloudflare Workers. Do not use.

#### signature

evaluate(file: Compatible, options: EvaluateOptions): Promise<MDXModule>

#### description

@mdx-js/mdx. compile + run. Requires {Fragment, jsx, jsxs} (or jsxDEV when development:true). VERIFIED BROKEN on Workers: EvalError: Code generation from strings disallowed for this context.

#### signature

toJsxRuntime(tree: Nodes, options: Options): JsxElement

#### description

hast-util-to-jsx-runtime@2.3.6. THE recommended renderer. Options: {Fragment, jsx, jsxs, components?, createEvaluater?, passNode?, elementAttributeNameCase?, development?, jsxDEV?, filePath?}. Handles mdxJsxFlowElement/mdxJsxTextElement natively. No eval.

#### signature

interface Evaluater { evaluateExpression(expression: Expression): unknown; evaluateProgram(program: Program): unknown }

#### description

hast-util-to-jsx-runtime. Supplied via `createEvaluater: () => Evaluater`. Required for capitalized MDX components. Implement as an ESTree-Identifier -> registry lookup: pure JS, Workers-safe, and the natural place to reject unknown components and JS expressions.

#### signature

unified().use(remarkParse).use(remarkGfm).use(remarkMdx).use(remarkRehype, {passThrough: string[]})

#### description

The Workers-safe MDX->hast pipeline. `passThrough` MUST list the five MDX node types or mdast-util-to-hast silently rewrites custom components to <div>.

#### signature

parser.parse(source): Root

#### description

unified + remark-parse + remark-mdx. Synchronous mdast parse, no React, no hast. mdxJsxFlowElement nodes expose .name, .attributes[], .position. Use for linting and top-level block extraction.

#### signature

createHighlighterCore(options: HighlighterCoreOptions<false>): Promise<HighlighterCore>

#### description

shiki/core @4.4.3. Pass {themes, langs, engine}. Use static lang/theme imports so everything is bundled.

#### signature

createJavaScriptRegexEngine(options?: JavaScriptRegexEngineOptions): RegexEngine

#### description

@shikijs/engine-javascript. The only Workers-viable Shiki engine. Options include target ('auto'|'ES2025'|'ES2024'|'ES2018') and forgiving.

#### signature

createOnigurumaEngine(options?: LoadWasmOptions | null): Promise<RegexEngine>

#### description

@shikijs/engine-oniguruma. VERIFIED BROKEN on Workers: shiki/wasm exports an ArrayBuffer, so instantiation hits the banned WebAssembly.instantiate(buffer) -> CompileError: Wasm code generation disallowed by embedder.

#### signature

rehypeShikiFromHighlighter(highlighter: HighlighterGeneric<any,any>, options: RehypeShikiCoreOptions): Transformer<Root, Root>

#### description

@shikijs/rehype/core (default export). Accepts a pre-built highlighter, so it inherits the JS regex engine. Makes the pipeline async: use `await pipeline.run(pipeline.parse(src))`.

#### signature

mermaid.render(id: string, text: string): Promise<{svg: string}>

#### description

mermaid@11.16.1. Client-only. VERIFIED to throw `ReferenceError: document is not defined` on Workers. Call inside useEffect after a dynamic import('mermaid').

### version

@mdx-js/mdx 3.1.1 · hast-util-to-jsx-runtime 2.3.6 · unified 11.0.5 · remark-parse 11.0.0 · remark-mdx 3.1.1 · remark-rehype 11.1.2 · mdast-util-to-hast 13.2.1 · mdast-util-mdx-jsx 3.2.0 · remark-gfm 4.0.1 · shiki/@shikijs/* 4.4.3 · mermaid 11.16.1 · react 19.2.8 · next-mdx-remote 6.0.0 · verified on workerd via wrangler 4.120.0, compatibility_date 2026-06-01

### breaking_changes

@mdx-js/mdx v3 removed the automatic `useMDXComponents` provider: `providerImportSource` is only wired up when you pass `useMDXComponents` to evaluate/run. Irrelevant for the recommended approach — pass `components` to `toJsxRuntime` directly.

hast-util-to-jsx-runtime v2 requires `createEvaluater` for any capitalized MDX JSX component. Older mdast/hast rendering guides that pass only `components` will throw `Cannot handle MDX estrees without createEvaluater` on `<Decision/>`.

remark-rehype 11 / mdast-util-to-hast 13 use `passThrough` (array of node type strings). Older `remark-rehype` guidance using custom `handlers` for MDX nodes no longer matches.

Shiki v4 moved the singleton `getHighlighter` to `createHighlighterCore` in `shiki/core`; engines are now explicit (`engine:` is required, no implicit WASM default). Code written for Shiki v1 will not compile.

### caveats

SILENT FAILURE #1 — omitting `passThrough` in remark-rehype turns every `<Decision>` into a `<div>` with no warning (mdast-util-to-hast defaultUnknownHandler). Always pass the five MDX node types.

SILENT FAILURE #2 — lowercase unknown JSX names (`<decision/>`) take the Literal branch in findComponentFromName and render as raw unknown HTML tags with NO error. Verified. Close it with the strict components Proxy (trap `getOwnPropertyDescriptor`, not `has` — the library gates on `hasOwnProperty`) and/or the write-time linter.

Flow vs text elements: `<Decision>hi</Decision>` on ONE line parses as mdxJsxTextElement and gets wrapped in `<p>`, producing invalid nesting like `<p><section>…</section></p>`. Put the children on their own lines to get a mdxJsxFlowElement. Enforce this in the linter for block-level components.

Do NOT `import {nodeTypes} from '@mdx-js/mdx'` in the Worker just for the 5 strings — it drags acorn/estree/recma (the whole compiler) into the bundle and caused multi-minute esbuild times plus spurious JSX-pragma warnings in my probe. Inline the array.

Custom component attribute values are ALWAYS strings unless bare (`severity="high"` -> 'high', `count="3"` -> '3', `recommended` -> true). Coerce numbers/enums explicitly.

Whether to allow `Literal` expression attributes (`count={3}`) is a policy choice made in your evaluater. Allowing only Identifier + Literal keeps the document format declarative and non-Turing-complete — recommended for agent-authored content.

Shiki's JS regex engine emulates Oniguruma via oniguruma-to-es; a few exotic TextMate grammars contain unsupported patterns and throw at load time. Pin your language list and test each; use `forgiving: true` only as a last resort.

Build the Shiki highlighter once per isolate (module-level memo). Per-request construction is expensive and there is no WASM cache to fall back on.

Perf: parse+transform measured 35.6 ms for a ~14 KB doc vs 2.45 ms to JSON.parse the cached hast (~14x). Workers CPU limits make this worth caching once documents grow; the cached hast renders byte-identically (verified).

react-dom/server worked in my probe WITHOUT nodejs_compat, but TanStack Start owns the SSR entry — confirm which react-dom server build its Cloudflare preset selects rather than relying on my standalone probe. [UNVERIFIED for TanStack Start specifically]

The Slack link_shared webhook, GitHub OAuth, DB, CodeMirror 6 and TanStack Start routing/content-negotiation were out of scope here and are covered by sibling agents.


---

# Reference repo: recalio

### summary

Project = /home/srujangurram/Developer/Personal/recalio, a pnpm@9.1.3 + turbo monorepo. The React app is apps/dashboard and it is TanStack **Router only** (@tanstack/react-router ^1.168.23, @tanstack/router-plugin ^1.167.22) — there is NO @tanstack/react-start anywhere in the repo. It is a pure client-rendered SPA (main.tsx + ReactDOM.createRoot + createRouter) shipped to Cloudflare **Pages** as static assets (wrangler.jsonc has only pages_build_output_dir). All server/Workers code lives in a separate app, apps/backend: Hono 4 on a Worker with D1 + R2 + 9 ratelimit bindings, an email() handler and a cron trigger, consumed from the SPA by typed Hono RPC (hc<AppType>). Stack: React 19, Vite 6, Tailwind v4 CSS-first (PostCSS in dashboard; @tailwindcss/vite only in the Astro marketing app), shadcn/ui in a shared packages/ui workspace, Drizzle ORM on D1 in packages/db, zod v3, TanStack Query v5 with localStorage persistence, Clerk for auth, Biome 1.8 for lint+format, Vitest 4. IMPORTANT for the Plantifiles rewrite: this repo is NOT a precedent for TanStack Start, SSR-on-Workers, server functions, content negotiation, GitHub OAuth (it uses Clerk), or Postgres — it is the split 'SPA on Pages + Hono Worker API' architecture. What IS worth copying: the Tailwind v4 @theme token system, the shared-UI workspace + components.json layout, the `-components/` route-colocation convention, `(group)/` and `_pathless` route naming, hoisted zod validateSearch, Drizzle+D1 wiring, and the multi-env wrangler.jsonc shape.

### files

#### path

/home/srujangurram/Developer/Personal/recalio

#### description

Monorepo root. packageManager pnpm@9.1.3; devDeps @biomejs/biome 1.8.0, playwright ^1.59.1, sharp ^0.34.5, turbo ^2.1.2; pnpm.patchedDependencies { "@unlazy/react@0.11.3": "patches/@unlazy__react@0.11.3.patch" }. Root scripts VERBATIM: build="turbo run build", dev="turbo run dev", format="biome format .", format:fix="biome format . --write", lint="biome lint .", lint:fix="biome lint . --write", format-and-lint="pnpm format && pnpm lint", format-and-lint:fix="biome check . --write", start:backend="pnpm --filter @recalio/backend start". Layout: apps/{dashboard,backend,marketing,extension}, packages/{ui,db,parsers,cli,ts-config}, plus PRD.md, PROPOSAL.md, turbo.json, pnpm-workspace.yaml, biome.json.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/package.json

#### description

THE TanStack app: @recalio/dashboard, private, type module. ROUTER-ONLY proof: deps contain "@tanstack/react-router": "^1.168.23" and "@tanstack/router-zod-adapter": "^1.81.5"; devDeps contain "@tanstack/router-plugin": "^1.167.22". No @tanstack/react-start / @tanstack/start / nitro / vinxi. Scripts VERBATIM: vars:gen="pnpm dlx dotvars@1.0.2 gen config.vars --platform node"; dev="pnpm dlx dotvars@1.0.2 run --env dev -- vite"; dev:cloud="pnpm dlx dotvars@1.0.2 run --env cloud -- vite"; build="pnpm dlx dotvars@1.0.2 run --env prod -- sh -c 'pnpm exec tsc -b && pnpm exec vite build'"; build:preview="pnpm exec tsc -b && pnpm exec vite build"; deploy:pages="wrangler pages deploy dist --project-name=recalio-dashboard"; test="vitest run --passWithNoTests". dependencies VERBATIM: @clerk/clerk-react ^5.7.0, @floating-ui/react ^0.27.3, @fontsource-variable/geist ^5.2.8, @fontsource-variable/lexend ^5.2.11, @fontsource-variable/literata ^5.2.8, @fontsource/opendyslexic ^5.2.5, @hookform/resolvers ^5.0.1, @paralleldrive/cuid2 ^2.2.2, @polar-sh/checkout ^0.1.0, @radix-ui/react-collapsible ^1.1.4, @recalio/backend workspace:^, @recalio/db workspace:*, @recalio/parsers workspace:*, @recalio/ui workspace:*, @tabler/icons-react ^3.31.0, @tanstack/query-sync-storage-persister ^5.99.2, @tanstack/react-query ^5.99.2, @tanstack/react-query-persist-client ^5.99.2, @tanstack/react-router ^1.168.23, @tanstack/router-zod-adapter ^1.81.5, @total-typescript/ts-reset ^0.5.1, @types/canvas-confetti ^1.9.0, @types/hast ^3.0.4, @unlazy/react ^0.11.3, @vitejs/plugin-react ^4.3.4, boring-avatars ^2.0.4, canvas-confetti ^1.9.3, date-fns ^3.6.0, highlight.js ^11.11.1, hono ^4.9.6, motion ^11.17.0, react ^19.1.0, react-dom ^19.0.0, react-hook-form ^7.55.0, react-hotkeys-hook ^4.6.1, react-markdown ^9.0.3, react-syntax-highlighter ^15.6.1, rehype-parse ^9.0.0, rehype-raw ^7.0.0, rehype-remark ^10.0.0, remark-gfm ^4.0.1, remark-parse ^11.0.0, remark-stringify ^11.0.0, retext-stringify ^4.0.0, sonner ^2.0.3, strip-markdown ^6.0.0, unified ^11.0.4, usehooks-ts ^3.1.0, web-haptics ^0.0.6, zod ^3.24.1. devDependencies VERBATIM: @tanstack/router-plugin ^1.167.22, @types/node ^22.14.1, @types/react ^19.1.1, @types/react-dom ^19.0.3, @types/react-syntax-highlighter ^15.5.13, @vitejs/plugin-react-swc ^3.7.2, globals ^15.9.0, linkedom ^0.18.12, postcss ^8.5.3, rehype-stringify ^10.0.1, remark-rehype ^11.1.1, tailwindcss ^4.1.4, typescript ^5.5.3, vite ^6.0.10, vite-plugin-pwa ^0.21.1, vitest ^4.0.15, wrangler ^4.83.0. Also "imports": { "#vars": "./config.generated.ts" }. Tech debt: both @vitejs/plugin-react and @vitejs/plugin-react-swc installed, only the former used; `globals` is a leftover from a deleted ESLint setup (repo uses Biome). NOTE: no Shiki, no CodeMirror, no Mermaid, no MDX here — markdown is react-markdown + highlight.js/react-syntax-highlighter, and the editor is @uiw/react-md-editor (in packages/ui).

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/vite.config.ts

#### description

146 lines, so quoted structurally (exceeds the 40-line verbatim rule; the PWA icon array is ~90 of those lines). Imports: `path, { dirname }` node:path, `fileURLToPath` node:url, `{ TanStackRouterVite } from "@tanstack/router-plugin/vite"`, `react from "@vitejs/plugin-react"`, `{ defineConfig } from "vite"`, `{ VitePWA } from "vite-plugin-pwa"`, `{ getVars } from "./config.generated"`. Async factory: `const EMPTY_VARS_KEY = "AA==";` / `export default defineConfig(async () => { const vars = await getVars({ ...process.env, VARS_KEY: process.env.VARS_KEY ?? EMPTY_VARS_KEY }); return { ... } })`. plugins: `TanStackRouterVite({ autoCodeSplitting: true })`, `react()`, `VitePWA({ registerType: "autoUpdate", workbox: { maximumFileSizeToCacheInBytes: 8000000 }, manifest: { name/short_name "Recalio", theme_color "hsl(32, 46%, 38%)", share_target: { action: "/share-target", method: "GET", params: { title, text, url } }, 15 icons } })`. `define: { __RECALIO_ENV__: JSON.stringify(vars), global: "globalThis" }`. `resolve.alias` is an ARRAY of {find,replacement}: "./runtimeConfig"→"./runtimeConfig.browser", "@ui"→path.resolve(__dirname, "../../packages/ui/src"), "@"→path.resolve(__dirname, "./src"). NO @tailwindcss/vite and NO Cloudflare vite plugin.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/wrangler.jsonc

#### description

VERBATIM, entire file: {
	"name": "recalio-dashboard",
	"compatibility_date": "2026-04-20",
	"pages_build_output_dir": "./dist"
}
Cloudflare Pages static deploy only — no `main`, no bindings, no SSR, no Functions dir.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/tsconfig.json

#### description

Path aliases VERBATIM: baseUrl ".", paths { "@/*": ["./src/*"], "@ui/*": ["../../packages/ui/src/*"] }. Also target ES2020, lib [ES2020,DOM,DOM.Iterable], module ESNext, moduleResolution "bundler", allowImportingTsExtensions, resolveJsonModule, isolatedModules, noEmit, jsx "react-jsx", strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch; include ["src"]; references [{ "path": "./tsconfig.node.json" }]. Debt: does not extend @recalio/ts-config although backend/packages do. Companion tsconfig.node.json is composite/emitDeclarationOnly with declarationDir ".tsbuild", include ["vite.config.ts","config.generated.ts"] — that's why `tsc -b` runs before `vite build`.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/components.json

#### description

shadcn config VERBATIM keys: $schema "https://ui.shadcn.com/schema.json", style "radix-nova", rsc false, tsx true, tailwind { config: "" (empty ⇒ Tailwind v4), css "../../packages/ui/src/styles/globals.css", baseColor "taupe", cssVariables true, prefix "" }, iconLibrary "lucide", aliases { components "@ui/components", utils "@ui/lib/utils", hooks "@ui/lib/hooks", lib "@ui/lib", ui "@ui/components/ui" }, rtl false, menuColor "default-translucent", menuAccent "subtle", registries {}. Debt: the `ui` alias points to @ui/components/ui but NO components/ui dir exists (primitives are flat in packages/ui/src/components/), and `hooks` says @ui/lib/hooks while the real dir is packages/ui/src/hooks/. A second components.json exists at packages/ui/components.json.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src

#### description

src/ to 3 levels. Root: routeTree.gen.ts, main.tsx, types.d.ts, vite-env.d.ts. Dirs: routes/, lib/, test-setup/. There is NO top-level components/, hooks/, server/, or types/ dir. routes/: __root.tsx, _dashboard.tsx, share-target.tsx, -components/, _dashboard/, read/. routes/-components/: feed-input.tsx, add-content-model.tsx, search.tsx, search.test.tsx, use-share-target-save.ts, use-share-target-save.test.tsx, file-input.tsx, top-nav.tsx, email-input.tsx, link-input.tsx, bottom-nav.tsx, use-feed-input.ts, nav-helpers.ts, share-target-meta.ts. routes/_dashboard/: pricing.tsx, sign-out.tsx, -components/ (document-card.tsx, empty-state.tsx, document-card-actions.tsx, seen-toggle-button.tsx, feed-card-actions.tsx, header.tsx, use-document-card-selection.ts, blog-image.tsx, theme-provider.tsx, document-card-skeleton.tsx, feed-image.tsx), plus one dir per section each holding index.tsx and its own -components/: (home)/, inbox/, archive/, discover/ (also -search.ts, -search.test.ts), search/, recall/, highlights/, settings/, email/, feeds/. routes/read/: $readId.tsx + -components/. lib/api/: client.ts, client.test.ts, hooks.ts, query-keys.ts, types.ts, cache-updates.ts. lib/hooks/: use-recall-session.ts, recall-session-index.ts, use-theme.ts, use-document-actions.ts, use-feed-actions.ts, use-feed-card-actions.ts, theme-metadata.ts, use-no-image.ts, use-highlights.ts, use-link-preview.ts, use-dashboard-highlights.ts, use-go-back.ts. lib/billing/: api.ts, plan-cards.tsx, upsell-modal.tsx, use-checkout.ts, use-billing.ts. lib/helpers/: get-link-origin.ts, convert-html-to-markdown.ts, liquid-gradient.ts, convert-text-to-slug.ts, estimate-reading-time.ts. lib/components/: user-menu.tsx, load-more-button.tsx, link-box.tsx. lib/email/: sanitize-email-html.ts. lib/search/: bangs.ts, parse-query.ts. test-setup/dom-parser.ts. Tests are colocated *.test.ts(x) beside sources.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routeTree.gen.ts

#### description

COMMITTED (generated but tracked): it appears in neither /.gitignore nor apps/dashboard/.gitignore; only biome.json excludes "**/*.gen.ts" from lint/format. Generated by TanStackRouterVite with autoCodeSplitting: true.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routes/__root.tsx

#### description

Root route + all providers. `export const Route = createRootRoute({ component: RootComponent, notFoundComponent: NotFound, errorComponent: ErrorScreen })`. Module-scope QueryClient: defaultOptions.queries { gcTime: 1000*60*60*24, staleTime: 1000*30 }. `createSyncStoragePersister({ storage: typeof window !== "undefined" ? window.localStorage : undefined, key: "recalio-query-cache" })` + `const QUERY_CACHE_BUSTER = "newsletter-senders-list-v1"` (hand-bumped string). Tree: PersistQueryClientProvider(persistOptions {persister, maxAge: 1000*60*60*24, buster}) > ThemeProvider > [<SignedIn><Outlet/></SignedIn>, <ClerkLoading><LoadingScreen/></ClerkLoading>, <SignedOut><RedirectToSignIn/></SignedOut>, <Toaster position="bottom-center"/>]. Auth is 100% client-side Clerk gating — no beforeLoad guard, no server session. errorComponent signature: `({ error, reset }: { error: Error; reset: () => void })`. Smell: root imports from a child route dir (./_dashboard/-components/empty-state, ./_dashboard/-components/theme-provider).

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routes/_dashboard.tsx

#### description

Canonical pathless layout route (whole file is ~22 lines): `export const Route = createFileRoute("/_dashboard")({ component: DashboardLayout })`; DashboardLayout = <div className="flex min-h-screen flex-col"> <TopNav/> <main aria-label="Dashboard content" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-8"><Outlet/></main> <BottomNav/> </div>. Children imported relatively from "./-components/top-nav", "./-components/bottom-nav".

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routes/_dashboard/(home)/index.tsx

#### description

Route-group example: `createFileRoute("/_dashboard/(home)/")` — the parenthesized dir contributes no URL segment, so it serves "/" inside the _dashboard layout. Full set of route ids observed VERBATIM across the app: "/_dashboard", "/_dashboard/(home)/", "/_dashboard/pricing", "/_dashboard/sign-out", "/_dashboard/inbox/", "/_dashboard/archive/", "/_dashboard/discover/", "/_dashboard/highlights/", "/_dashboard/search/", "/_dashboard/recall/", "/_dashboard/settings/", "/share-target", "/read/$readId". ROUTING VERDICT: nested-directory style (NOT flat posts.index.tsx dotted style); `_prefix` = pathless layout, `(parens)` = route group, `-prefix` = excluded-from-routing colocation (files AND dirs), `$param` = dynamic segment, index.tsx = index route. Data loading: ZERO `loader`, `loaderDeps`, or `beforeLoad` in the entire app — every route only sets `component` and (usually) `validateSearch`; all fetching happens in components via TanStack Query hooks.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routes/_dashboard/search/index.tsx

#### description

Search-param validation idiom, hoisted above the route: `const searchValidator = zodSearchValidator(z.object({ q: z.string() }).partial());` then `createFileRoute("/_dashboard/search/")({ component: SearchPage, validateSearch: searchValidator })`. Same `zodSearchValidator` from "@tanstack/router-zod-adapter" is used in share-target.tsx, _dashboard/pricing.tsx, archive/index.tsx, discover/index.tsx, highlights/index.tsx, inbox/index.tsx, read/$readId.tsx. TECH DEBT worth NOT copying: @tanstack/router-zod-adapter is the deprecated package (superseded by @tanstack/zod-adapter's `zodValidator`) and is pinned to ^1.81.5 while react-router is ^1.168.23.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/main.tsx

#### description

SPA bootstrap — the proof there is no SSR/Start. Side-effect imports "@fontsource-variable/geist" and "@recalio/ui/globals.css"; `import { routeTree } from "./routeTree.gen"; const router = createRouter({ routeTree });` then the type-registration block `declare module "@tanstack/react-router" { interface Register { router: typeof router } }`; mounts into `document.getElementById("root")` guarded by `if (!rootElement.innerHTML)`; tree = StrictMode > ClerkProvider(publishableKey={__RECALIO_ENV__.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/") > RouterProvider. No router `context`, no queryClient in router context, no hydrateRoot/StartClient.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/types.d.ts

#### description

Global env typing for the compile-time `define` injection: `import type { Vars } from "#vars"; declare global { const __RECALIO_ENV__: Vars; }` plus a hand-rolled `declare module "canvas-confetti"`. Idiosyncratic pattern: env vars are baked into the bundle at build time by the `dotvars` CLI (config.generated.ts, gitignored as config.generated.js/.d.ts), addressed via the package `imports` subpath "#vars".

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/lib/api/client.ts

#### description

723 lines. End-to-end typed client via Hono RPC: `import type { AppType } from "@recalio/backend"; import { hc } from "hono/client"; const api = hc<AppType>(__RECALIO_ENV__.VITE_BACKEND_URL).api.v1;`. Helpers: `authOptions(getToken)` builds `{ headers: { authorization: `Bearer ${token}` } }` and throws "Missing auth token"; `read<T>(response)` throws on !ok using response.text(); `rpc<T>(getToken, call)` composes them. Calls look like `api.feeds.$get({ query }, options)`, `api.documents.$post({ json: { url } }, options)`, `api.documents[":documentId"].highlights.$get({ param: { documentId } }, options)`. Single exported object literal `export const apiClient = { listFeeds, detectFeed, listDocuments, search, getDocument, ... }` where EVERY method takes `getToken: () => Promise<string|null>` as its first arg. Debt: token-getter threading through ~40 methods is very noisy; DB enum→wire-string mapping (toCollectionStatus/toDocumentReadStatus/toSourceType) is duplicated client-side; getDocument does two sequential round-trips.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/lib/api/query-keys.ts

#### description

Worth copying: centralized const query-key factories, all `as const`. E.g. `export const documentKeys = { all: ["documents"] as const, list: (filters: DocumentListFilters) => ["documents", "list", filters, "infinite-v2"] as const, detail: (documentId: string) => ["documents", documentId] as const, ... }` plus feedKeys, highlightKeys, recallKeys, inboundEmailKeys, shortcutKeys, kindleKeys, apiKeyKeys, billingKeys, each with matching exported `*Filters` types. Debt: manual cache-version suffixes baked into keys ("infinite-v2", "speech-manifest-v6").

#### path

/home/srujangurram/Developer/Personal/recalio/packages/ui/package.json

#### description

Shared UI workspace @recalio/ui (private). NO build step — exports raw source: "./globals.css": "./src/styles/globals.css", "./postcss.config": "./postcss.config.js", "./lib/*": "./src/lib/*.ts", "./components/*": "./src/components/*.tsx". Only script: ui:add="pnpm dlx shadcn@latest add". deps: class-variance-authority ^0.7.1, clsx ^2.1.1, tailwind-merge ^3.2.0, tw-animate-css ^1.4.0, @tailwindcss/typography ^0.5.16, shadcn ^4.3.0, radix-ui ^1.4.3 (the unified package) plus 12 individual @radix-ui/react-* packages, lucide-react ^0.488.0, @tabler/icons-react ^3.31.0, cmdk ^1.1.1, vaul ^0.9.1, embla-carousel-react ^8.1.8, next-themes ^0.4.6, sonner ^2.0.3, @uiw/react-md-editor ^4.1.0, react-hook-form ^7.55.0, @hookform/resolvers ^5.0.1, usehooks-ts ^3.1.0, zod ^3.24.1. devDeps: tailwindcss ^4.1.4, @tailwindcss/postcss ^4.1.4, postcss ^8.5.3, typescript ^5.3.3, @recalio/ts-config workspace:*. Debt: mixes `radix-ui` umbrella with individual @radix-ui/react-* deps; ships next-themes in a non-Next SPA.

#### path

/home/srujangurram/Developer/Personal/recalio/packages/ui/src

#### description

Component conventions. Layout: components/ (flat, 24 primitives), components/commons/, components/icons/, hooks/ (use-media-query.ts), lib/ (utils.ts), styles/ (globals.css). Filenames are ALL kebab-case (card.tsx, dropdown-menu.tsx, markdown-editor.tsx, input-group.tsx, toggle-group.tsx, hover-card.tsx, credenza.tsx); exported identifiers are Pascal. NO barrel/index.ts anywhere — imports are deep and explicit, e.g. `import { Button } from "@recalio/ui/components/button"` (via exports map) or `import { Button } from "@ui/components/button"` (via alias). Both spellings appear in the same file (__root.tsx) — pick ONE if copying. There is no components/ui/ subdir despite components.json claiming one.

#### path

/home/srujangurram/Developer/Personal/recalio/packages/ui/src/lib/utils.ts

#### description

cn() location, entire file VERBATIM: `import { type ClassValue, clsx } from "clsx";` / `import { twMerge } from "tailwind-merge";` / `export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }`. Imported as `@ui/lib/utils` (dashboard alias) or `@recalio/ui/lib/utils` (exports map).

#### path

/home/srujangurram/Developer/Personal/recalio/packages/ui/src/components/button.tsx

#### description

Canonical component + cva pattern. `import { type VariantProps, cva } from "class-variance-authority"; import { Slot } from "radix-ui"; import type * as React from "react"; import { cn } from "@ui/lib/utils";` then `const buttonVariants = cva(base, { variants: { variant: {default,outline,secondary,ghost,destructive,link}, size: {default,xs,sm,lg,icon,"icon-xs","icon-sm","icon-lg"} }, defaultVariants: { variant: "default", size: "default" } })`. PROP TYPING STYLE (no interfaces, no React.FC): `function Button({ className, variant = "default", size = "default", asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) { const Comp = asChild ? Slot.Root : "button"; return <Comp data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} /> }` then `export { Button, buttonVariants };` (named exports at the bottom; one component + its variants per file). Note the data-slot/data-variant/data-size attribute convention used for descendant styling.

#### path

/home/srujangurram/Developer/Personal/recalio/packages/ui/src/styles/globals.css

#### description

648 lines — the single source of styling truth for dashboard AND marketing. Tailwind v4 CSS-first, head VERBATIM: `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css"; @import "@uiw/react-md-editor/markdown-editor.css";` then `@plugin "@tailwindcss/typography";` then cross-workspace content scanning `@source "../../../../apps/dashboard/src"; @source "../../../../apps/marketing/src"; @source "../";` then DARK MODE: `@custom-variant dark (&:is(.dark *));`. Then `@theme inline { --font-sans: 'Geist Variable', sans-serif; --font-heading: var(--font-sans); --color-background: var(--background); ... --color-sidebar-ring: var(--sidebar-ring); --radius-sm: calc(var(--radius) * 0.6); ... --radius-4xl: calc(var(--radius) * 2.6); --aspect-blog: 16 / 9; --animate-shine: shine 2s linear infinite; @keyframes shine {...} }` and custom utilities via `@utility shine-mask { ... }`. There is NO tailwind.config.{js,ts} anywhere in the repo — Tailwind v4 confirmed. Tokens are bare CSS vars (--background, --primary, --radius, chart-*, sidebar-*) defined in :root and per-theme classes further down.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/postcss.config.js

#### description

Entire file VERBATIM: `export { default } from "@recalio/ui/postcss.config";` — Tailwind v4 is wired through @tailwindcss/postcss re-exported from packages/ui/postcss.config.js, NOT through @tailwindcss/vite. (The Astro marketing app is the only place using @tailwindcss/vite ^4.1.4.)

#### path

/home/srujangurram/Developer/Personal/recalio/apps/dashboard/src/routes/_dashboard/-components/theme-provider.tsx

#### description

Dark-mode implementation, whole pattern: `const THEME_CLASS_MAP: Record<ResolvedTheme, readonly string[]> = { light: [], dark: ["dark"], cream: ["theme-cream"], groove: ["theme-groove","dark"], nord: ["theme-nord","dark"], dracula: ["theme-dracula","dark"], paper: ["theme-paper"], solarized: ["theme-solarized"] };` `const ALL_THEME_CLASSES = [...new Set(Object.values(THEME_CLASS_MAP).flat())];` then a useEffect that does `root.classList.remove(...ALL_THEME_CLASSES); root.classList.add(...THEME_CLASS_MAP[resolvedTheme]);` on documentElement, driven by `useTheme()` from @/lib/hooks/use-theme. Worth copying: multi-theme classes composed with the `dark` class so the Tailwind @custom-variant keeps working. Debt: next-themes is a dependency of packages/ui but this hand-rolled provider is what actually runs; being client-only it flashes unstyled/wrong theme on load (no SSR/inline script).

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/wrangler.jsonc

#### description

THE real Cloudflare Worker config. VERBATIM (bindings sections): top level { "name": "recalio-backend", "main": "src/index.ts", "compatibility_date": "2026-04-20", "compatibility_flags": ["nodejs_compat"], "preview_urls": false, "vars": { "VARS_ENV": "prod" }, "triggers": { "crons": ["0 */12 * * *"] } }. `"ratelimits"`: 9 entries each { name, namespace_id, simple: { limit, period } } — AUTH_USER_RATE_LIMITER/681901/300 per 60, SHORTCUT_AUTH_RATE_LIMITER/681902/30, API_FREE_RATE_LIMITER/681903/60, API_PRO_RATE_LIMITER/681904/240, INGEST_FREE_RATE_LIMITER/681905/10, INGEST_PRO_RATE_LIMITER/681906/60, AI_PRO_RATE_LIMITER/681907/10, TTS_PRO_RATE_LIMITER/681908/60, KINDLE_RATE_LIMITER/681909/5. `"d1_databases"`: [{ "binding": "DB", "database_name": "recalio-prod", "database_id": "6850941d-254f-46ba-9c9d-7af3a823fc8a", "migrations_dir": "../../packages/db/drizzle" }]. `"r2_buckets"`: [{ "binding": "DOCUMENT_AUDIO", "bucket_name": "recalio-document-audio-prod" }]. `"env": { "dev": { "workers_dev": false, "preview_urls": true, "vars": { "VARS_ENV": "dev" }, d1_databases: [DB→recalio-dev/a126ced6-159f-464e-952b-f2621450dc9b, same migrations_dir], r2_buckets: [DOCUMENT_AUDIO→recalio-document-audio-dev], "routes": [{ "pattern": "api-dev.recalio.com", "custom_domain": true }] } }`. NO KV namespaces anywhere in the repo. Worth copying: pointing migrations_dir at the shared db package, and the named-env override pattern.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/package.json

#### description

@recalio/backend, private, type module, exports { ".": "./src/index.ts" } (raw TS consumed by the SPA for AppType), imports { "#vars": "./config.generated.ts" }, engines node>=20.9.0. Scripts VERBATIM: preinstall="npx only-allow pnpm"; test="vitest run --passWithNoTests"; typecheck="tsc --noEmit"; dev="CLOUDFLARE_ENV=dev pnpm exec wrangler dev --port 3000"; migrate:dev="wrangler d1 migrations apply recalio-dev --env dev --remote"; migrate:dev:list="wrangler d1 migrations list recalio-dev --env dev --remote"; migrate:prod="wrangler d1 migrations apply recalio-prod --remote"; migrate:prod:list="wrangler d1 migrations list recalio-prod --remote"; deploy="wrangler deploy --env=\"\""; deploy:dev="wrangler deploy --env dev". deps: @ai-sdk/openai ^1.3.10, ai ^4.3.5, @cf-wasm/photon ^0.3.4 (WASM image processing on Workers), @clerk/backend ^3.4.13, @hono/zod-validator ^0.4.3, @polar-sh/sdk ^0.42.0, @recalio/db workspace:*, @recalio/parsers workspace:*, hono ^4.9.6, postal-mime ^2.7.4, thumbhash ^0.1.1, zod ^3.25.76. devDeps: @recalio/ts-config workspace:*, @types/node ^22.14.1, typescript ^5.0.0, vitest ^4.0.15, wrangler ^4.12.0. Debt: wrangler version skews across apps (^4.12.0 here vs ^4.83.0 in dashboard/marketing); zod ^3.25.76 vs ^3.24.1 elsewhere; vars:gen is a stub script that just prints an error and exits 1.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/src/index.ts

#### description

Worker entrypoint, complete pattern: `import { app } from "./app.js";` then `const worker = { fetch: app.fetch, async email(message: EmailMessage, env: AppBindings, _ctx: WorkerExecutionContext) { return processInboundEmail({ repo: createAppRepository(env), vars: await getAppVars(env), message }); } }; export default worker; export { app }; export type { AppType } from "./app.js";` Note hand-rolled `WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void }` and `EmailMessage = Parameters<typeof processInboundEmail>[0]["message"]` instead of @cloudflare/workers-types — DEBT: no `wrangler types`/worker-configuration.d.ts in the repo, so all CF binding types are hand-written.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/src/app.ts

#### description

Hono app assembly — the closest thing here to a 'JSON API endpoints' reference. `const app = createHonoApp();` then middleware in order: `requestId({ limitLength: 128 })`, `secureHeaders({ crossOriginResourcePolicy: false })`, `prettyJSON()`, `cors({ origin: (origin) => resolveCorsOrigin(origin), allowHeaders: ["authorization","content-type","idempotency-key"], allowMethods: ["GET","POST","PATCH","DELETE","OPTIONS"] })`, `createRequestContext()`. `app.notFound(...)` and `app.onError(...)` funnel into a shared `errorResponse(c, { code, message, status })` with codes "not_found"/"http_exception"/"internal_error", logging `routePath(c)` and `c.get("requestId")`. CRITICAL TYPING IDIOM: routes are chained into one const so RPC types survive — `const routes = app.route("/", healthRouter).route("/", polarWebhookRouter).route("/api/v1/documents", documentsRouter)....route("/api/v1/integrations/kindle", kindleIntegrationRouter);` then `export type AppType = typeof routes; export { routes as app };`. Modules mounted: documents (4 routers), feeds, highlights, search, api-keys, shortcut, billing (+polar webhook at "/"), email-address, email-messages, newsletter-senders, recall-sessions, kindle. Note: a webhook receiver mounted at root is the nearest analogue to a Slack link_shared endpoint.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/src/http/hono.ts

#### description

Whole file — the typed-app factory worth copying: `import { createFactory } from "hono/factory"; import type { AppBindings, AppVariables } from "./context.js"; type AppEnv = { Bindings: AppBindings; Variables: AppVariables }; const factory = createFactory<AppEnv>({ defaultAppOptions: { strict: false } }); export function createHonoApp() { return factory.createApp(); }` Every module router is built with createHonoApp() so bindings+context vars are typed everywhere.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/backend/src/http/context.ts

#### description

111 lines. Hand-rolled Cloudflare binding types (no @cloudflare/workers-types): local `R2ObjectBody`, `R2BucketBinding` (get/put), `RateLimitBinding = { limit(config: { key: string }): Promise<{ success: boolean }> }`. Then `export type AppBindings = RuntimeVars & { DB: Parameters<typeof createDb>[0]; DOCUMENT_AUDIO?: R2BucketBinding; AUTH_USER_RATE_LIMITER?: RateLimitBinding; ... KINDLE_RATE_LIMITER?: RateLimitBinding }` — all 9 limiters optional. `RuntimeVars` is a mapped type that unwraps secret-wrapper types from #vars. Also `export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";`, `export const authIdentityTypeSchema = z.enum(["session","api_key"]); export const AUTH_IDENTITY_TYPE = authIdentityTypeSchema.enum;` and a discriminated `AuthIdentity` union. Siblings in src/http/: rate-limit.ts, middleware.ts, body-limit.ts, validation.ts, cors.ts, cursor.ts (cursor pagination), api-key-kind.ts, errors.ts, scopes.ts, wire.ts (DB→wire DTO mapping). src/modules/<feature>/routes.ts is the per-feature unit; src/shared/ has url.ts, image-metadata.ts, article-parse-options.ts.

#### path

/home/srujangurram/Developer/Personal/recalio/packages/db

#### description

Data layer. package.json: @recalio/db, type module, exports { ".": "./src/index.ts", "./runtime": "./src/runtime.ts" }; deps drizzle-orm ^0.44.2, zod ^3.24.1, vite ^6.0.10, vite-plugin-node-polyfills ^0.23.0; devDeps drizzle-kit ^0.31.5, vitest ^4.0.15; scripts db:generate="drizzle-kit generate --config=./drizzle.config.ts", db:migrate="drizzle-kit migrate --config=./drizzle.config.ts". src/: client.ts, index.ts, runtime.ts, repositories/, schema/, shared/. schema/ files: index.ts, users.ts, documents.ts, feeds.ts, highlights.ts, user-billing.ts, document-speech-chunks.ts, inbound-email.ts, newsletter-sender.ts, parse-attempts.ts, recall-sessions.ts, helpers.ts. client.ts entire file: `import { type AnyD1Database, drizzle } from "drizzle-orm/d1"; import * as schema from "./schema/index.js"; export function createDb(client: AnyD1Database) { return drizzle(client, { schema }); } export type Database = ReturnType<typeof createDb>;`. There is a repository layer over Drizzle (createRepository / createAppRepository) rather than raw queries in route handlers. NO Prisma. Validation = zod v3 everywhere (no arktype, no valibot); zod schemas live beside their consumers (backend module routes via @hono/zod-validator, route search params in the dashboard) — there is no central schemas/ dir. Debt: vite + vite-plugin-node-polyfills as runtime deps of a DB package; .js extensions in TS imports (NodeNext style) here vs extensionless in the dashboard.

#### path

/home/srujangurram/Developer/Personal/recalio/packages/db/drizzle.config.ts

#### description

Entire file: baseConfig = { schema: "./src/schema/index.ts", out: "./drizzle", dialect: "sqlite" as const }; then `export default defineConfig(accountId && databaseId && token ? { ...baseConfig, driver: "d1-http", dbCredentials: { accountId, databaseId, token } } : baseConfig)` reading CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_D1_TOKEN. Worth copying: conditional d1-http driver so `generate` works without credentials while `migrate` uses the HTTP driver.

#### path

/home/srujangurram/Developer/Personal/recalio/apps/marketing

#### description

The ONLY app in the repo with server-side rendering — and it is Astro, not TanStack. package.json deps: astro ^5.18.1, @astrojs/cloudflare ^12.6.13, @astrojs/react ^4.4.2, @astrojs/check ^0.9.8, @recalio/ui workspace:*, @tailwindcss/vite ^4.1.4, @tailwindcss/postcss ^4.1.4, tailwindcss ^4.1.4, react/react-dom ^19.1.0, resend ^4.0.0, sonner, zod ^3.24.1, usehooks-ts; devDeps wrangler ^4.83.0. Scripts VERBATIM: dev="pnpm dlx dotvars run --env dev -- astro dev"; start="VARS_KEY=\"${VARS_KEY:-$(pnpm dlx dotvars key export)}\" pnpm dlx dotvars run --env ${VARS_ENV:-dev} -- astro dev"; build="VARS_KEY=... pnpm dlx dotvars run --env ${VARS_ENV:-prod} -- sh -c 'pnpm exec astro check && pnpm exec astro build'"; deploy:pages="wrangler pages deploy --project-name=recalio-marketing"; astro="astro". wrangler.jsonc VERBATIM: {
	"name": "recalio-marketing",
	"compatibility_date": "2026-04-20",
	"compatibility_flags": ["nodejs_compat"],
	"pages_build_output_dir": "./dist",
	"vars": { "VARS_ENV": "prod" }
}
So: SSR-on-Cloudflare precedent exists in this repo only via @astrojs/cloudflare on Pages with nodejs_compat.

#### path

/home/srujangurram/Developer/Personal/recalio/biome.json

#### description

Lint/format choice: Biome 1.8.0 ONLY — no eslint config, no .prettierrc, no oxlint anywhere. VERBATIM highlights: organizeImports.enabled true; files.ignore includes ".next/**", ".turbo/**", ".wrangler/**", ".wxt/**", ".output/**", "node_modules/**", "pnpm-lock.yaml", ".env*", "public/**", "dist/**", "**/*.gen.ts", "**/config.generated.ts", "**/config.generated.d.ts", "**/vite.config.d.ts", ".astro/**", "__test_dataset__/**"; linter.rules.recommended true with complexity.noForEach "off" and nursery.useSortedClasses { fix: "safe", level: "warn", options: { attributes: ["classList"], functions: ["clsx","cva","tw"] } } — that last rule is why class strings are machine-sorted. Formatting style observed everywhere: tabs, double quotes, semicolons. Debt: biome 1.8.0 is well behind current 2.x, and useSortedClasses is a nursery rule.

#### path

/home/srujangurram/Developer/Personal/recalio/.gitignore

#### description

910B. Confirms what is/isn't committed: ignores node_modules/, dist/, build/, out/, .output/, .turbo/, .wrangler-adjacent caches, coverage/, *.tsbuildinfo, .env / .env.* (keeps .env.example), .varskey, *.unlocked.vars, *.local.vars, config.generated.js, config.generated.d.ts, vite.config.d.ts, test-results/, playwright-report/, tmp/, datasets/, __test_dataset__/, and notably `scripts/` (with negations !/apps/backend/scripts/, !/packages/parsers/scripts/) and `/docs/`. routeTree.gen.ts and config.generated.ts are NOT ignored ⇒ both are committed.

### architecture

HEADINGS 1-10, compressed.

1. PATH & FLAVOR — /home/srujangurram/Developer/Personal/recalio (monorepo root); the app is /home/srujangurram/Developer/Personal/recalio/apps/dashboard. It is **TanStack Router only**: package.json has "@tanstack/react-router": "^1.168.23" + devDep "@tanstack/router-plugin": "^1.167.22"; `@tanstack/react-start` is absent from every package.json and from pnpm-lock.yaml usage in this app. Confirmed SPA: src/main.tsx calls ReactDOM.createRoot(...).render(<RouterProvider router={createRouter({ routeTree })}/>). No SSR, no server functions, no Nitro. Sibling apps: backend (Hono Worker), marketing (Astro SSR on CF), extension (WXT).

2. DEPS & SCRIPTS — quoted verbatim in the files[] entries for apps/dashboard/package.json (full dep + devDep + script lists), apps/backend/package.json, apps/marketing/package.json, packages/ui/package.json, packages/db/package.json, and the root package.json.

3. SRC STRUCTURE (3 levels) — apps/dashboard/src/{routeTree.gen.ts,main.tsx,types.d.ts,vite-env.d.ts} + routes/ + lib/ + test-setup/. Routes: routes/. Components: NO src/components — page components are colocated in `-components/` dirs at each route level (routes/-components/, routes/_dashboard/-components/, routes/_dashboard/<section>/-components/, routes/read/-components/); cross-route shared components in src/lib/components/; design-system primitives in packages/ui/src/components/. lib/utils: src/lib/helpers/ (app) + packages/ui/src/lib/utils.ts (cn). Hooks: src/lib/hooks/ + packages/ui/src/hooks/ + colocated use-*.ts inside -components/. Server code: NOT in this app — apps/backend/src/{app.ts,index.ts,http/,modules/,shared/}. Types: no types/ dir; src/types.d.ts for globals, src/lib/api/types.ts for wire DTOs, DB types re-exported from @recalio/db.

4. ROUTING CONVENTIONS — nested-directory style, NOT flat dotted (`posts.index.tsx` never appears). `__root.tsx` present with createRootRoute({component,notFoundComponent,errorComponent}). `_dashboard.tsx` + `_dashboard/` = pathless layout (createFileRoute("/_dashboard")). `(home)/` = route group contributing no URL segment (createFileRoute("/_dashboard/(home)/")). `-` prefix = excluded from routing, used for both dirs (-components/) and files (-search.ts). `$readId.tsx` = dynamic param. index.tsx = index route. **Zero `loader`, `loaderDeps`, or `beforeLoad` in the whole app** — routes declare only `component` and usually `validateSearch: zodSearchValidator(schema)` (from the deprecated @tanstack/router-zod-adapter); all data fetching is in components via TanStack Query. Type registration via `declare module "@tanstack/react-router" { interface Register { router: typeof router } }` in main.tsx. `src/routeTree.gen.ts` IS committed (absent from both .gitignore files; only biome ignores **/*.gen.ts). autoCodeSplitting: true.

5. COMPONENT CONVENTIONS — kebab-case filenames everywhere, Pascal exports; one component (+ its cva variants) per file; named exports at file bottom (`export { Button, buttonVariants }`); NO barrels/index.ts — deep explicit imports. Prop typing: no interfaces, no React.FC — inline destructured params typed as `React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }`; class-variance-authority ^0.7.1 used for every variant surface; `data-slot`/`data-variant`/`data-size` attributes for descendant styling. shadcn/ui lives in the shared workspace at packages/ui/src/components/ — FLAT, there is no components/ui/ dir even though components.json declares ui: "@ui/components/ui". cn() at packages/ui/src/lib/utils.ts (clsx + tailwind-merge), imported as @ui/lib/utils or @recalio/ui/lib/utils.

6. STYLING — **Tailwind v4** (tailwindcss ^4.1.4; NO tailwind.config.* anywhere in the repo). Dashboard compiles it via PostCSS: apps/dashboard/postcss.config.js is literally `export { default } from "@recalio/ui/postcss.config";` (@tailwindcss/postcss). @tailwindcss/vite ^4.1.4 is used ONLY by apps/marketing (Astro). Single stylesheet packages/ui/src/styles/globals.css (648 lines): `@import "tailwindcss"` + tw-animate-css + shadcn/tailwind.css, `@plugin "@tailwindcss/typography"`, cross-package `@source "../../../../apps/dashboard/src"` etc., tokens in `@theme inline { --color-*: var(--*), --radius-* via calc(), --animate-* }` with raw CSS vars (--background/--primary/--radius/--chart-*/--sidebar-*) in :root and per-theme classes. Dark mode = class-based: `@custom-variant dark (&:is(.dark *));` plus a hand-rolled ThemeProvider that swaps documentElement classes across 8 themes (dark/cream/groove/nord/dracula/paper/solarized), composing e.g. ["theme-nord","dark"].

7. CLOUDFLARE — three wrangler.jsonc files (no .toml). dashboard: Pages static only (name/compatibility_date/pages_build_output_dir) — quoted verbatim in files[]. marketing: Pages + nodejs_compat + vars. backend: the real Worker — main src/index.ts, nodejs_compat, cron "0 */12 * * *", **D1** binding DB (recalio-prod 6850941d-…, recalio-dev a126ced6-…, migrations_dir ../../packages/db/drizzle), **R2** binding DOCUMENT_AUDIO (recalio-document-audio-prod/-dev), 9 `ratelimits` bindings, env.dev override with custom domain api-dev.recalio.com. **NO KV namespaces, no Durable Objects, no Queues, no Hyperdrive, no Workers AI binding anywhere.** Deploy scripts: dashboard `wrangler pages deploy dist --project-name=recalio-dashboard`; marketing `wrangler pages deploy --project-name=recalio-marketing`; backend `wrangler deploy --env=""` / `--env dev`, plus `wrangler d1 migrations apply … --remote`. CI: .github/workflows/ exists (not inspected in depth).

8. DATA LAYER — ORM: **Drizzle** (drizzle-orm ^0.44.2, drizzle-kit ^0.31.5) on **D1/SQLite** via `drizzle(client, { schema })` from drizzle-orm/d1; no Prisma, no Postgres. Schemas: packages/db/src/schema/*.ts (users, documents, feeds, highlights, user-billing, document-speech-chunks, inbound-email, newsletter-sender, parse-attempts, recall-sessions, helpers) barreled by schema/index.ts, with a repository layer in packages/db/src/repositories/. Validation: **zod v3** everywhere (^3.24.1 / backend ^3.25.76); no arktype/valibot. Backend request validation via @hono/zod-validator ^0.4.3; route search params via zodSearchValidator. Server state: **TanStack Query v5** (^5.99.2) + @tanstack/react-query-persist-client + query-sync-storage-persister (localStorage, key "recalio-query-cache", 24h maxAge, manual `buster` string), keys centralized in src/lib/api/query-keys.ts, transport = Hono RPC `hc<AppType>` for end-to-end types.

9. CONFIG FILES — tsconfig aliases (exact strings): apps/dashboard/tsconfig.json paths `"@/*": ["./src/*"]` and `"@ui/*": ["../../packages/ui/src/*"]`, mirrored in vite.config.ts resolve.alias as find "@ui"/"@" (array form, order matters since "@" is a prefix of "@ui"); plus project reference to tsconfig.node.json (composite, include ["vite.config.ts","config.generated.ts"]). vite.config.ts is 146 lines so it is summarized structurally rather than pasted (per the <40-line rule) — every plugin, define, and alias is transcribed in its files[] entry. Lint/format: **Biome 1.8.0 only** (biome.json quoted in files[]) — no eslint/prettier/biome-alternative configs exist; tabs + double quotes; nursery useSortedClasses with functions ["clsx","cva","tw"]. components.json: two of them, apps/dashboard/components.json (quoted verbatim) and packages/ui/components.json. Tests: Vitest 4, colocated *.test.ts(x), all packages use `vitest run --passWithNoTests`.

10. WORTH COPYING vs TECH DEBT.
COPY: (a) `-components/` route-colocation + `(group)/` + `_pathless` naming — keeps a page and its parts adjacent while staying out of the URL; (b) chained `const routes = app.route(...).route(...)` + `export type AppType = typeof routes` with `hc<AppType>` for zero-codegen end-to-end API types; (c) hono/factory `createFactory<{Bindings;Variables}>()` so every router is binding-typed; (d) Tailwind v4 @theme inline token layer + `@custom-variant dark (&:is(.dark *))` + multi-theme class composition; (e) shared no-build UI package exporting raw .tsx/.css through an exports map; (f) drizzle.config.ts conditionally enabling driver "d1-http", and wrangler migrations_dir pointing into the shared db package; (g) const query-key factories with typed filter objects; (h) `wrangler d1 migrations apply` scripts split per env; (i) cursor pagination + shared errorResponse({code,message,status}) + requestId logging.
DO NOT COPY: (1) @tanstack/router-zod-adapter — deprecated, replaced by @tanstack/zod-adapter's zodValidator, and pinned 87 minors behind the router; (2) zero use of loader/beforeLoad — everything fetches client-side after mount, which is exactly wrong for an SSR/agent-readable product and gives no auth guard (auth is client-only Clerk <SignedIn> gating, trivially bypassed for UI purposes); (3) hand-written Cloudflare binding types (R2BucketBinding, RateLimitBinding, WorkerExecutionContext) instead of `wrangler types` / @cloudflare/workers-types — there is no worker-configuration.d.ts in the repo; (4) build-time env baking via `pnpm dlx dotvars@1.0.2` + committed config.generated.ts + a `__RECALIO_ENV__` global define — plus two backend/marketing `vars:gen` scripts that are stubs printing an error and exiting 1; (5) duplicated/contradictory aliasing: the same component importable as @ui/components/button, @recalio/ui/components/button, or a relative path, all three used in one file; components.json aliases pointing at nonexistent dirs; (6) both @vitejs/plugin-react and @vitejs/plugin-react-swc installed; leftover `globals` dep from a removed ESLint setup; next-themes shipped but unused in favor of a hand-rolled provider; (7) version skew across workspaces (wrangler ^4.12.0 vs ^4.83.0; zod ^3.24.1 vs ^3.25.76; typescript ^5.0.0 vs ^5.5.3); (8) manual cache-bust strings embedded in query keys and the persister buster ("infinite-v2", "speech-manifest-v6", "newsletter-senders-list-v1"); (9) 723-line src/lib/api/client.ts threading a getToken callback through every method, with DB-enum→wire-string mapping duplicated on the client; (10) __root.tsx reaching into a child route's -components/ dir; (11) dashboard tsconfig not extending the shared @recalio/ts-config.
RELEVANCE WARNING for the Plantifiles PLAN.md rewrite: this repo answers none of the target requirements directly — no TanStack Start, no SSR pages from a Worker, no content negotiation, no MDX/component registry, no CodeMirror 6, no Shiki, no Mermaid, no GitHub OAuth (Clerk), no Slack webhook, no Postgres. Its Markdown path is react-markdown + remark/rehype + highlight.js and its editor is @uiw/react-md-editor. The only SSR-on-Cloudflare precedent on this machine's repo is Astro via @astrojs/cloudflare on Pages with nodejs_compat. Treat recalio as a source of conventions (naming, tokens, workspace shape, D1/Drizzle/wrangler wiring, Hono RPC typing) and NOT as an architectural template for a TanStack Start SSR app.
