<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# 🧠 @plantifiles/core

The plan format: parsing, linting, and structural diffing for Plantifiles artifacts.

---

</div>

An artifact is MDX with a fixed component set — `TLDR`, `Decision`, `Tradeoff`, `Option`, `Rejected`, `Phase`, `Risk`, `Diagram`, `CodeSketch`, `Callout`, `Check` — plus frontmatter and one of three profiles: `plan`, `lesson`, or `guided-plan`. This package parses that source into blocks, lints it before publish, and diffs two versions block by block.

## 🧰 API

- `lint` — findings (rule, severity, line), a score, and the `canPublish` gate
- `analyzePlan` — blocks with stable keys, content hashes, and heading paths
- `normalize` — canonical form of a source document
- `diff` — structural diff between two versions
- `EXAMPLE_PLAN`, `EXAMPLE_LESSON`, `EXAMPLE_GUIDED_PLAN` — reference artifacts

## 🧪 Test

```bash
pnpm --filter @plantifiles/core test
```

Consumed by the web app (lint and render) and the CLI (`plantifiles lint`).
