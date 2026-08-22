import { defineConfig } from "@playwright/test";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;

export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/clerk-fixture.ts",
	globalTeardown: "./e2e/global-teardown.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: "list",
	use: {
		baseURL: origin,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm --dir ../.. db:migrate:local && pnpm dev",
		url: origin,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
		timeout: 120_000,
	},
});
