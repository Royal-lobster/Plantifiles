import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

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
	return execFileSync(process.execPath, [cli, ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, PLANTIFILES_TOKEN: token, PLANTIFILES_BASE_URL: baseUrl },
	});
}

test("agent publish, browser review, approval, and version diff", async ({ page, baseURL }) => {
	if (!baseURL) throw new Error("Playwright baseURL is required");
	const agentRepo = await mkdtemp(`${tmpdir()}/plantifiles-playwright-`);
	try {
		await page.goto("/login");
		await page.waitForLoadState("networkidle");
		await page.getByRole("button", { name: "Sign in as Demo User" }).click();
		await expect(page).toHaveURL(/\/w\/demo$/);

		await page.goto("/settings/tokens");
		const userMenu = page.getByRole("button", { name: "Open user menu" });
		const writePlanSkill = page.getByRole("menuitem", { name: "Write-plan skill" });
		await expect(async () => {
			await userMenu.click();
			await expect(writePlanSkill).toBeVisible({ timeout: 1_000 });
		}).toPass();
		await writePlanSkill.press("Escape");
		await expect(writePlanSkill).toBeHidden();
		const tokenName = `Playwright ${Date.now()}`;
		const tokenNameInput = page.getByRole("textbox", { name: "Create a token" });
		await tokenNameInput.pressSequentially(tokenName);
		await expect(tokenNameInput).toHaveValue(tokenName);
		await tokenNameInput.press("Tab");
		await page.getByRole("button", { name: "Create token" }).click();
		const token = (await page.getByRole("dialog").locator("code").textContent())?.trim();
		expect(token).toMatch(/^pf_/);
		if (!token) throw new Error("Token creation returned no plaintext token");

		const title = `Reversible deploy approvals ${Date.now()}`;
		const source = planSource(title);
		const planFile = resolve(agentRepo, "plan.mdx");
		await writeFile(planFile, source, "utf8");
		const firstPush = runCli(
			[
				"push",
				planFile,
				"--workspace",
				"demo",
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
		expect(parsedPlanUrl.pathname).toMatch(/^\/p\/demo\//);
		await page.goto("/w/demo");
		const dashboardRow = page.getByRole("link", { name: new RegExp(title) });
		await expect(dashboardRow).toContainText("draft");
		await expect(dashboardRow).toContainText("v1");
		await dashboardRow.click();

		await expect(page.getByRole("heading", { name: title })).toBeVisible();
		await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
		await expect(page.locator('[data-block-kind="Diagram"] svg[role~="graphics-document"]')).toBeVisible();
		await page.getByRole("button", { name: /^Change theme/ }).click();
		await page.getByRole("menuitemradio", { name: "Dark" }).click();
		await expect(page.locator("html")).toHaveClass(/dark/);

		const planArticle = page.locator("main > article");
		const tldrParagraph = page.locator('[data-block-kind="TLDR"] p');
		await page.getByRole("button", { name: "Reading settings" }).click();
		await page.getByRole("menuitem", { name: "Literata" }).click();
		await page.getByRole("button", { name: "Text size, step 5 of 5" }).click();
		await page.getByRole("button", { name: "Line width, step 1 of 3" }).click();
		await expect(planArticle).toHaveCSS("font-family", /Literata/);
		await expect(planArticle).toHaveCSS("font-size", "20px");
		await expect(planArticle).toHaveCSS("max-width", "640px");
		await expect(tldrParagraph).toHaveCSS("font-family", /Literata/);
		await page.reload();
		await expect(planArticle).toHaveCSS("font-family", /Literata/);
		await expect(planArticle).toHaveCSS("font-size", "20px");
		await expect(planArticle).toHaveCSS("max-width", "640px");
		await expect(tldrParagraph).toHaveCSS("font-family", /Literata/);

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
