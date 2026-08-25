<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# 📡 @plantifiles/api-client

Typed HTTP client for the Plantifiles API. Used by the CLI and the MCP server.

---

</div>

Hand `PlantifilesClient` a base URL and a token getter; it covers everything an agent needs against the API.

## 🧰 API

- `createPlan` / `createVersion` / `movePlan` / `listMoveTargets` — publishing and moving
- `getPlan` / `listPlans` / `listWorkspaces` — reading
- `commentOnPlan` — comments, marked agent-assisted
- `resolvePlan` / `getPlanMarkdown` — accept an id or a plan URL

Errors throw as `ApiError` carrying the status and the API's message body.

## 🧪 Test

```bash
pnpm --filter @plantifiles/api-client test
```
