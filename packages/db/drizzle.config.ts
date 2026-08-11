import { defineConfig } from "drizzle-kit";

const baseConfig = {
	dialect: "sqlite" as const,
	schema: "./src/schema.ts",
	out: "./migrations",
	casing: "snake_case" as const,
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_TOKEN;

export default defineConfig(
	accountId && databaseId && token
		? {
				...baseConfig,
				driver: "d1-http",
				dbCredentials: { accountId, databaseId, token },
			}
		: baseConfig,
);
