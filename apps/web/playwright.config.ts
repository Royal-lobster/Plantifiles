import { defineConfig } from "@playwright/test";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
const port = new URL(origin).port || (origin.startsWith("https:") ? "443" : "80");
const startServer = `${process.env.CI ? "" : "devcap "}pnpm exec vite dev --port ${port}`;

export default defineConfig({
	testDir: "./e2e",
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
		command: `pnpm --dir ../.. db:migrate:local && pnpm exec wrangler d1 execute plantifiles --local --file seed.sql && ${startServer}`,
		env: { VITE_LOCAL_DEV: "true", VITE_PUBLIC_URL: origin },
		url: `${origin}/cli/callback?code=ready&state=ready`,
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
