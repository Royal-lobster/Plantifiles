import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clerk } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { e2eWorkspaceSlug, E2E_EMAIL as email } from "./clerk-fixture";

/* SSR ships interactive markup before the client bundle attaches, and Playwright's
   actionability checks cannot see hydration: typing into a pre-hydration input
   updates the DOM but never reaches React state, so the form submits an empty
   value. Every navigation that precedes an interaction waits for the attach. */
async function waitForHydration(page: Page) {
	await page.waitForFunction(() => {
		const main = document.querySelector("main");
		return Boolean(main && Object.keys(main).some((key) => key.startsWith("__reactFiber")));
	});
}

const cli = resolve(process.cwd(), "../cli/dist/index.js");

function planSource(title: string): string {
	return `---
title: ${title}
---
<TLDR>
Ship reversible deploy approvals so production changes carry an explicit reviewer decision before release.
</TLDR>

## Why now

Dashboard deploys currently require coordination outside the plan, leaving the approval record disconnected from implementation.

<Decision owner="@demo" id="approval-scope">
Should one approval cover a release or each production environment separately?
</Decision>

<Tradeoff>
<Option name="Release-wide approval" recommended>
One review keeps the path fast and gives the release a single accountable decision.
</Option>
<Option name="Per-environment approval">
Each environment is explicit, but reviewers repeat the same decision and can leave rollout state inconsistent.
</Option>
</Tradeoff>

<Rejected what="Approval in chat only">
Chat history is not attached to the plan version and cannot prove which source a reviewer approved.
</Rejected>

<Diagram lang="mermaid">
\`\`\`mermaid
graph LR
A[Plan approved] --> B[Deploy request]
B --> C[Reviewer approval]
C --> D[Production]
\`\`\`
</Diagram>

## Delivery

The first phase records and enforces the approval before any production transition.

<Phase n="1" title="Approval gate">
- [ ] Record reviewer and approved plan version
- [ ] Block production deploy until approval exists
</Phase>

<Risk severity="high">
A stale approval could release different source. Bind every approval to the immutable plan version.
</Risk>
`;
}

function runCli(args: string[], cwd: string, token: string, baseUrl: string): string {
	/* The fixture puts CLERK_SECRET_KEY on this process for Clerk's testing
	   helpers. The CLI has no use for it, so the child gets an explicit
	   environment rather than an inherited one. */
	return execFileSync(process.execPath, [cli, ...args], {
		cwd,
		encoding: "utf8",
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? cwd,
			PLANTIFILES_TOKEN: token,
			PLANTIFILES_BASE_URL: baseUrl,
		},
	});
}

/* The callback is the one authenticated-looking surface that must work signed
   out: the browser arrives straight from Clerk, and the page only re-presents
   what Clerk put in the query for the terminal to collect. */
test("hosted OAuth callback hands the authorization response to the terminal", async ({ context, page }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	const response = await page.goto("/cli/callback?code=browser-code&state=browser-state");

	expect(response?.headers()["cache-control"]).toBe("no-store");
	expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
	await waitForHydration(page);
	await expect(page.getByRole("heading", { name: "Return to your terminal" })).toBeVisible();
	await expect(page.getByTestId("cli-authorization-code")).toHaveText("code=browser-code&state=browser-state");

	/* The code is single-use, so the query cannot survive in history or a shared URL. */
	await expect(page).toHaveURL("/cli/callback");

	await page.getByRole("button", { name: "Copy authorization code" }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe("code=browser-code&state=browser-state");
});

test("agent publish, browser review, approval, and version diff", async ({ page, baseURL }) => {
	if (!baseURL) throw new Error("Playwright baseURL is required");
	const workspaceSlug = e2eWorkspaceSlug();
	const agentRepo = await mkdtemp(`${tmpdir()}/plantifiles-playwright-`);
	try {
		/* Real Clerk session. `clerk.signIn` mints a backend sign-in ticket for the
		   fixture reviewer, so it needs a page that has loaded the Clerk client and
		   will not navigate away: every real route either redirects a signed-out
		   visitor to Clerk or 307s, so the not-found page is the only stable host.
		   Navigating to the workspace URL afterwards lets the app's
		   organizationSyncOptions activate the Organization, which is what projects
		   the local workspace and membership. */
		await page.goto("/e2e-clerk-bootstrap");
		await clerk.signIn({ page, emailAddress: email });
		await page.goto(`/w/${workspaceSlug}`);
		await expect(page).toHaveURL(new RegExp(`/w/${workspaceSlug}$`));

		/* The CLI runs headless here, so it authenticates with a user-scoped Clerk
		   API key rather than completing the browser OAuth handshake. */
		await page.goto("/settings/api-keys");
		await waitForHydration(page);
		const keyName = `Playwright ${Date.now()}`;
		const keyNameInput = page.getByRole("textbox", { name: "Create an API key" });
		await keyNameInput.pressSequentially(keyName);
		await expect(keyNameInput).toHaveValue(keyName);
		await keyNameInput.press("Tab");
		await page.getByRole("button", { name: "Create API key" }).click();
		const token = (await page.getByTestId("created-api-key").textContent())?.trim();
		if (!token) throw new Error("API key creation returned no secret");

		const title = `Reversible deploy approvals ${Date.now()}`;
		const source = planSource(title);
		const planFile = resolve(agentRepo, "plan.mdx");
		await writeFile(planFile, source, "utf8");
		const firstPush = runCli(
			[
				"push",
				planFile,
				"--workspace",
				workspaceSlug,
				"--agent",
				"claude-code",
				"--prompt",
				"Plan a reversible production approval gate",
			],
			agentRepo,
			token,
			baseURL,
		).trim();
		const planUrl = firstPush.split("\n")[0];
		if (!planUrl) throw new Error("CLI push returned no plan URL");
		const parsedPlanUrl = new URL(planUrl);
		expect(parsedPlanUrl.origin).toBe(baseURL);
		expect(parsedPlanUrl.pathname).toMatch(new RegExp(`^/p/${workspaceSlug}/`));
		await page.goto(`/w/${workspaceSlug}`);
		await waitForHydration(page);
		const dashboardRow = page.getByRole("link", { name: new RegExp(title) });
		await expect(dashboardRow).toContainText("draft");
		await expect(dashboardRow).toContainText("v1");
		await dashboardRow.click();

		await expect(page.getByRole("heading", { name: title })).toBeVisible();
		await expect(page.getByRole("banner").getByRole("link", { name: "Plantifiles home" })).toBeVisible();
		await expect(page.locator('[data-block-kind="Diagram"] svg[role~="graphics-document"]')).toBeVisible();
		/* The toggle's accessible name is the control's state, so the locator has to
		   match either name or it stops resolving the moment the theme flips. */
		const themeToggle = page.getByRole("banner").getByRole("button", { name: /Use (dark|light) theme/ });
		await expect(themeToggle).toHaveAccessibleName("Use dark theme");
		await themeToggle.click();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await expect(themeToggle).toHaveAccessibleName("Use light theme");
		await page.reload();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await waitForHydration(page);

		const markdown = await page.request.get(planUrl, { headers: { Accept: "text/markdown" } });
		expect(markdown.status()).toBe(200);
		expect(markdown.headers()["content-type"]).toContain("text/markdown");
		const markdownBody = await markdown.text();
		expect(markdownBody).toContain(`title: "${title}"`);
		expect(markdownBody).toContain('<Decision owner="@demo" id="approval-scope">');

		await page.getByRole("button", { name: "Comment on TLDR" }).click();
		await page.getByPlaceholder("Leave a review comment").fill("Keep the approval bound to this exact plan version.");
		await page.getByRole("button", { name: "Comment", exact: true }).click();
		await expect(page.getByText("Keep the approval bound to this exact plan version.")).toBeVisible();
		await page.getByRole("button", { name: "Submit for review" }).click();
		await expect(page.getByText(/^in review$/i)).toBeVisible();
		await page.getByRole("button", { name: "Resolve decision" }).click();
		await page.getByLabel("Resolution").fill("Use one release-wide approval bound to the immutable version.");
		await page.getByRole("button", { name: "Save resolution" }).click();
		await expect(page.getByText(/^resolved$/i)).toBeVisible();
		await page.getByRole("button", { name: "Approve current version" }).click();
		await expect(page.getByText(/^approved$/i)).toBeVisible();

		const revision = source
			.replace(
				"Ship reversible deploy approvals so production changes carry an explicit reviewer decision before release.",
				"Ship auditable deploy approvals so production changes carry an explicit reviewer decision before release.",
			)
			.replace(
				"</Risk>\n",
				`</Risk>\n\n<Risk severity="med">\nReviewer absence can stall a release. Assign a backup reviewer before the rollout window.\n</Risk>\n`,
			);
		await writeFile(planFile, revision, "utf8");
		const secondPush = runCli(
			["push", planFile, "--agent", "codex", "--prompt", "Add reviewer availability risk"],
			agentRepo,
			token,
			baseURL,
		);
		expect(secondPush).toContain("Modified TLDR");
		expect(secondPush).toContain("Added Risk");

		await page.goto(planUrl);
		await expect(page.getByText("v2", { exact: true })).toBeVisible();
		await expect(page.getByText(/^in review$/i)).toBeVisible();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await expect(page.getByText("Modified TLDR", { exact: false })).toBeVisible();
		await expect(page.getByText("Added Risk", { exact: false })).toBeVisible();

		const pulled = runCli(["pull", planUrl], agentRepo, token, baseURL);
		expect(pulled).toBe(await readFile(planFile, "utf8"));
	} finally {
		await rm(agentRepo, { recursive: true, force: true });
	}
});
