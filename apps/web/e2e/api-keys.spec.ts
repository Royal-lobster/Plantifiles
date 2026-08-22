import { clerk } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { E2E_EMAIL as email } from "./clerk-fixture";

async function waitForHydration(page: Page) {
	await page.waitForFunction(() => {
		const main = document.querySelector("main");
		return Boolean(main && Object.keys(main).some((key) => key.startsWith("__reactFiber")));
	});
}

/* API keys are user-scoped, so this surface must work for a session with no
   active Organization -- the state a reviewer is in immediately after signing
   in, before visiting a workspace. The plan loop always activates an
   Organization first, so only this test covers the org-less path.

   It also leaves no key behind: revocation is the reason these are Clerk keys
   rather than ones we mint and store. */
test("api keys are issued and revoked without an active organization", async ({ page }) => {
	await page.goto("/e2e-clerk-bootstrap");
	await clerk.signIn({ page, emailAddress: email });

	await page.goto("/settings/api-keys");
	await waitForHydration(page);
	await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

	const name = `Playwright ${Date.now()}`;
	await page.getByRole("textbox", { name: "Create an API key" }).fill(name);
	await page.getByRole("button", { name: "Create API key" }).click();

	/* Clerk returns the secret exactly once, at creation. */
	const secret = (await page.getByTestId("created-api-key").textContent())?.trim();
	expect(secret).toMatch(/^ak_/);

	await page.keyboard.press("Escape");
	const revokeTrigger = page.getByRole("button", { name: `Revoke ${name}` });
	await expect(revokeTrigger).toBeVisible();

	await revokeTrigger.click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: `Revoke ${name}` })
		.click();

	await expect(page.getByText(`${name} was revoked.`)).toBeVisible();
	await expect(page.getByRole("button", { name: `Revoke ${name}` })).toHaveCount(0);
});
