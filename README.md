<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="88" alt="Plantifiles logo" />

# Plantifiles

**Plan documents built for both people and coding agents.**

An agent publishes a structured artifact, the team reviews and approves it in the browser, and another agent pulls the approved source directly into its build session.

[Website](https://plantifiles.com) · [CLI](./apps/cli) · [Contributing](./CONTRIBUTION.md)

</div>

## The product loop

1. A coding agent writes a structured plan, lesson, or guided plan.
2. The CLI or MCP server publishes the source to a workspace.
3. Reviewers read the rendered document, comment on specific blocks, resolve decisions, and approve the current version.
4. A coding agent retrieves the approved Markdown from the same URL and implements it.

The source remains canonical throughout the loop. Browser presentation, review state, version history, and agent retrieval all refer to the same artifact.

## Source-first artifacts

Plantifiles uses Markdown with a closed component vocabulary for decisions, tradeoffs, phases, risks, diagrams, code sketches, callouts, and knowledge checks. Deterministic parsing and linting keep every artifact readable without executing arbitrary MDX.

Three artifact profiles share that format:

- **Plans** capture evidence, decisions, risks, and implementation phases.
- **Lessons** explain a topic and include retrieval and application checks.
- **Guided plans** combine executable planning with a reader-paced learning path.

## Review that stays attached to the work

Comments attach to stable document blocks instead of line numbers. Threads survive new versions when their block remains and move into a detached section when it does not.

Decision blocks have explicit owners and resolutions. Approvals belong to a specific version, and a plan advances only when its review gates are satisfied.

## Structural version history

Every publish after the first creates a new version. Plantifiles compares document blocks rather than raw lines, producing a reviewable summary of what was added, removed, changed, or moved.

The reader can open any historical version while keeping comments, decisions, authorship, and approval state connected to the plan.

## One URL for people and agents

A plan URL serves the full review experience to a browser and clean Markdown to clients that request `text/markdown`. The CLI's pull command retrieves the stored source byte-for-byte.

That shared URL is the handoff: people approve what they can read, and agents build from the exact approved artifact.

## Workspaces and access

Each workspace maps to a Clerk Organization. Organization membership controls access while preserving stable local authorship for plans, comments, OAuth sessions, and user-scoped API keys.

Authors can move a plan into another workspace without republishing it. Version history, comments, and decisions move with the plan; approvals on the current version are cleared so the destination workspace can review it.

## Agent interfaces

- The [`plantifiles` CLI](./apps/cli) supports login, lint, publish, pull, move, status, and workspace discovery.
- The [`@plantifiles/mcp`](./apps/mcp) server exposes the same loop as MCP tools over stdio.
- The [`write-plan` skill](./skills/write-plan/SKILL.md) teaches coding agents the artifact format and review handoff.
- User-scoped API keys support CI, SSH hosts, and other headless environments.

## Open source

Plantifiles is developed in the open. Repository setup, architecture, verification, configuration, deployment, and release instructions live in [`CONTRIBUTION.md`](./CONTRIBUTION.md).
