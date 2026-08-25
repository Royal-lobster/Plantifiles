<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# 🗄️ @plantifiles/db

Drizzle schema and client for the Cloudflare D1 database.

---

</div>

Tables: `user`, `workspace`, `membership`, `plan`, `planVersion`, `planBlock`, `comment`, `decision`, `approval`. Clerk users, organizations, and memberships project into the first three at sign-in, so everything else references stable local ids. `createDb` builds the Drizzle instance for a D1 binding.

## 🛠️ Migrations

The schema lives in `src/schema.ts`; generated SQL lands in `migrations/` and is applied by wrangler (the D1 `migrations_dir` points here):

```bash
pnpm db:generate         # drizzle-kit generate from the schema
pnpm db:migrate:local    # local D1
pnpm db:migrate:remote   # production
```

All three scripts run from the repo root.
