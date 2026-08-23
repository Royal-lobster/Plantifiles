import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eWorkspaceSlug, E2E_EMAIL as email } from "./clerk-fixture";

/* SSR ships interactive markup before the client bundle attaches, and
   Playwright's actionability checks cannot see hydration: a click on a
   pre-hydration button updates nothing. Every navigation that precedes an
   interaction waits for the attach. Copied from plan-loop.spec.ts. */
async function waitForHydration(page: Page) {
	await page.waitForFunction(() => {
		const main = document.querySelector("main");
		return Boolean(main && Object.keys(main).some((key) => key.startsWith("__reactFiber")));
	});
}

async function signIn(page: Page) {
	await page.goto("/e2e-clerk-bootstrap");
	await clerk.signIn({ page, emailAddress: email });
}

test("empty state shows agent-first install instructions", async ({ context, page }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	const slug = e2eWorkspaceSlug();
	await signIn(page);
	await page.goto(`/w/${slug}`);
	await waitForHydration(page);
	await expect(page.getByRole("heading", { name: "Nothing has been proposed yet." })).toBeVisible();

	/* Agent tab is the default; the prompt ships collapsed behind a copy button. */
	await expect(page.getByRole("tab", { name: "Agent" })).toHaveAttribute("data-state", "active");
	const promptRow = page.getByText("Setup prompt", { exact: true });
	await expect(promptRow).toBeVisible();
	await expect(page.getByRole("button", { name: "Copy agent setup instructions" })).toBeVisible();

	/* Copying works while collapsed. */
	await page.getByRole("button", { name: "Copy agent setup instructions" }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toContain("Set up Plantifiles on this machine:");
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toContain("npx skills add Royal-lobster/Plantifiles -g");
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toContain("plantifiles push plan.mdx --workspace <workspace-slug>");

	/* Expanding reveals the full prompt. */
	await page.getByRole("button", { name: "Show" }).click();
	await expect(page.getByText("Set up Plantifiles on this machine:")).toBeVisible();
	await page.screenshot({ path: "test-results/install-empty-agent.png", fullPage: true });
	/* Human tab spells the same steps out one command per row. */
	await page.getByRole("tab", { name: "Human" }).click();
	await expect(page.getByText("Install the CLI")).toBeVisible();
	await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
	await expect(page.getByText("plantifiles push plan.mdx -w <workspace-slug>")).toBeVisible();
	await page.screenshot({ path: "test-results/install-empty-human.png", fullPage: true });
});

test("dashboard header opens the install dialog", async ({ page }) => {
	const slug = e2eWorkspaceSlug();
	await signIn(page);
	await page.goto(`/w/${slug}`);
	await waitForHydration(page);
	await page.getByRole("button", { name: "Install CLI" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText("Install Plantifiles");
	await expect(dialog.getByRole("tab", { name: "Agent" })).toHaveAttribute("data-state", "active");
	await expect(dialog.getByText("Setup prompt", { exact: true })).toBeVisible();
	await page.screenshot({ path: "test-results/install-dialog.png" });
});
