import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: "list",
	use: {
		baseURL: "http://localhost:3000",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm --dir ../.. db:migrate:local && pnpm dev",
		url: "http://localhost:3000/login",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
