import { createDb } from "@plantifiles/db";
import { env } from "cloudflare:workers";
import { getVars } from "#vars";

type RuntimeBindings = Cloudflare.Env & Record<string, unknown>;

export type RuntimeConfig = {
	BETTER_AUTH_SECRET: string;
	GITHUB_CLIENT_ID: string | undefined;
	GITHUB_CLIENT_SECRET: string | undefined;
	LOCAL_DEV: string;
	PUBLIC_URL: string;
};

export function getBindings(): RuntimeBindings {
	return env as RuntimeBindings;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
	const vars = await getVars(getBindings());
	return {
		BETTER_AUTH_SECRET: vars.BETTER_AUTH_SECRET.unwrap(),
		GITHUB_CLIENT_ID: vars.GITHUB_CLIENT_ID.unwrap() || undefined,
		GITHUB_CLIENT_SECRET: vars.GITHUB_CLIENT_SECRET.unwrap() || undefined,
		LOCAL_DEV: vars.LOCAL_DEV,
		PUBLIC_URL: vars.PUBLIC_URL,
	};
}

export function getDb() {
	return createDb(env.DB);
}
