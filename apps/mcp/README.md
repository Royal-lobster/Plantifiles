# Plantifiles MCP server

A local stdio MCP server exposing the Plantifiles HTTP API to coding agents. The API remains the source of truth for linting, publishing, authorization, comments, and Markdown rendering.

## Build

```bash
pnpm --filter @plantifiles/mcp build
```

## Add to Claude Code

After `plantifiles login`, the MCP server reuses the CLI's service configuration and OAuth credentials:

```bash
claude mcp add --scope project \
  --transport stdio plantifiles \
  -- node "${PWD}/apps/mcp/dist/index.js"
```

For CI or another headless environment, set `PLANTIFILES_BASE_URL` and a user-scoped Clerk API key in `PLANTIFILES_TOKEN`.

The equivalent project-scoped `.mcp.json` is:

```json
{
  "mcpServers": {
    "plantifiles": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/apps/mcp/dist/index.js"],
      "env": {
        "PLANTIFILES_TOKEN": "ak_your_clerk_api_key",
        "PLANTIFILES_BASE_URL": "https://plantifiles.example.com"
      }
    }
  }
}
```

## Tools

- `create_plan` — publish a new plan.
- `update_plan` — publish a new version with optional optimistic concurrency.
- `move_plan` — move a plan to a different organization after it was published to the wrong one.
- `get_plan` — return the exact Markdown-with-frontmatter bytes served by the plan URL.
- `list_plans` — list plans and review state for a workspace.
- `comment_on_plan` — add a plan or block comment marked as agent-assisted.
