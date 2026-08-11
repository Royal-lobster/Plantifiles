# Decisions

- 2026-08-12 — Pin pnpm 11 and require Node 22+ because the Cloudflare and TanStack toolchain support that boring LTS baseline.
- 2026-08-12 — Treat every root Markdown AST node except frontmatter as a block; this gives comments and diffs stable anchors for prose as well as components.
- 2026-08-12 — Normalize block source by converting CRLF to LF and trimming outer whitespace; author formatting inside a block remains significant.

- 2026-08-12 — Report single-line block children as `block-children-lines`, keeping the finding distinct from vocabulary errors so authors can fix formatting directly.
- 2026-08-12 — Use compatibility date 2026-08-04 because pinned workerd 2026.8.4 rejects 2026-08-12 as a future date.
- 2026-08-12 — Use one production D1 database and one KV namespace with the same binding names locally and remotely so Worker code has no environment-specific branches.
- 2026-08-12 — Execute plan, version, block, and decision writes as one raw D1 batch so atomicity is explicit and every block insert stays below the 100-parameter limit.
- 2026-08-12 — Replace author frontmatter in negotiated Markdown with canonical product metadata while preserving the byte-exact source on the JSON API for CLI pulls.
- 2026-08-12 — Treat Anthropic prose summaries as best-effort and retain the deterministic structural summary when the API is absent or fails.
- 2026-08-12 — Commit a deterministic local seed identity and token so integration and smoke runs do not depend on GitHub OAuth credentials.