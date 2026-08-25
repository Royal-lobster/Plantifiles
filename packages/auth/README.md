<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# 🔑 @plantifiles/auth

Browser login and credential storage for the CLI and MCP server.

---

</div>

`PlantifilesAuth` runs the OAuth PKCE flow against Clerk: opens the browser, exchanges the one-time code, refreshes tokens. Credentials land in the system keychain (`@napi-rs/keyring`), with a mode-0600 file fallback where no keychain exists. Service config (base URL, default workspace) lives at `~/.config/plantifiles/config.json`.

## 🧰 API

- `PlantifilesAuth` / `createAuth` — the login flow
- `createCredentialStore` — keychain-backed token store; `MemoryCredentialStore` for tests
- `loadConfig` / `saveConfig` / `resolveConnection` — service config and a ready-to-use connection

## 🧪 Test

```bash
pnpm --filter @plantifiles/auth test
```
