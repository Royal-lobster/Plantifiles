<div align="center">

<img src="https://raw.githubusercontent.com/Royal-lobster/Plantifiles/main/apps/web/public/favicon.svg" width="80" alt="Plantifiles logo" />

# ⌨️ plantifiles CLI

Command-line client for [Plantifiles](https://plantifiles.com) — publish a plan, pull an approved one back.

---

</div>

An agent publishes a structured plan, the team reviews and approves it in the browser, and another agent pulls the approved Markdown into its build session. The same plan URL serves both.

## 📦 Install

```bash
npm install -g plantifiles
# or run without installing
npx plantifiles@latest --help
```

Requires Node.js 22 or newer.

## 🔑 Set up

Authorize this machine through the browser:

```bash
plantifiles login
```

`login` opens Plantifiles in your browser; paste the one-time authorization code from the callback page into the terminal. Tokens are stored in the system keychain, with a mode-0600 credential-file fallback when no keychain is available. `plantifiles whoami` verifies the credential; `plantifiles logout` revokes the refresh token.

Headless environments (CI, SSH boxes) use a user-scoped API key from `plantifiles.com/settings/api-keys` instead:

```bash
export PLANTIFILES_BASE_URL=https://plantifiles.com
export PLANTIFILES_TOKEN=ak_replace_with_your_api_key
```

## 🤖 Set up your coding agent

Install the `write-plan` skill globally so your agent knows the plan format and the publish loop:

```bash
npx skills add Royal-lobster/Plantifiles -g
```

The same skill is always available at <https://plantifiles.com/skills/write-plan/SKILL.md> if you'd rather hand the file to the agent yourself.

## 🧰 Usage

```
Usage: plantifiles [options] [command]

  login                              Authorize this machine through the browser
  logout                             Revoke this machine's browser login
  whoami                             Show the signed-in account and verify the credential
  workspaces                         List workspaces you belong to
  push <file>                        Publish a plan or create its next version
  pull <id-or-url>                   Fetch byte-identical plan source
  move <file-or-id-or-url> --to      Move a plan to a different organization
  lint <file>                        Lint a plan locally
  open <id>                          Open a plan in the browser
  status                             List workspace plans
```

### 📤 Publish a plan

```bash
plantifiles lint plan.mdx
plantifiles push plan.mdx \
  --workspace my-workspace \
  --agent claude-code \
  --prompt "Plan the requested feature"
```

`push` prints the plan URL. At login the CLI records a default workspace when your account has exactly one; otherwise the first `push` and `status` need `--workspace <slug>` (`plantifiles workspaces` lists them). Later pushes of the same file reuse its tracked workspace.

### 📥 Pull an approved plan

```bash
plantifiles pull https://plantifiles.com/p/my-workspace/my-plan -o approved-plan.mdx
```

The URL serves the rendered plan to people and byte-identical Markdown to agents, so one link carries a plan through review and into an implementation session.

### 🚚 Fix a wrong workspace

A plan pushed into the wrong organization moves without being republished, keeping its version history, comments, and decisions. Approvals on the current version are cleared, because the new organization hasn't reviewed it:

```bash
plantifiles move plan.mdx --to other-workspace
```

Only the plan's author can move it, and only into an organization they belong to. Pass `--slug <slug>` when the destination already has a plan at that slug.

## 🔗 Related

- [`@plantifiles/mcp`](https://github.com/Royal-lobster/Plantifiles/tree/main/apps/mcp) — the same loop over MCP for agents that prefer tools over a shell
- [Repository](https://github.com/Royal-lobster/Plantifiles) — the web app, the skill source, and the issue tracker
