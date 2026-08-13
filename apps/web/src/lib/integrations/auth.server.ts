import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "@plantifiles/db/schema";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb, getRuntimeConfig } from "./runtime.server";

export async function getAuth() {
	const runtime = await getRuntimeConfig();
	if (!runtime.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required.");

	const github =
		runtime.GITHUB_CLIENT_ID && runtime.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: runtime.GITHUB_CLIENT_ID,
						clientSecret: runtime.GITHUB_CLIENT_SECRET,
						scope: ["user:email"],
					},
				}
			: undefined;

	return betterAuth({
		database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
		secret: runtime.BETTER_AUTH_SECRET,
		baseURL: runtime.PUBLIC_URL,
		socialProviders: github,
		session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
		plugins: [tanstackStartCookies()],
	});
}
