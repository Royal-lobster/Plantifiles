# Decisions

- 2026-08-12 — Pin pnpm 11 and require Node 22+ because both Next.js 16 and the workspace tooling support that boring LTS baseline.
- 2026-08-12 — Treat every root Markdown AST node except frontmatter as a block; this gives comments and diffs stable anchors for prose as well as components.
- 2026-08-12 — Normalize block source by converting CRLF to LF and trimming outer whitespace; author formatting inside a block remains significant.
