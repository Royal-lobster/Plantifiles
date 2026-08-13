import { createDb } from "@plantifiles/db";
import { env } from "cloudflare:workers";
import { getVars } from "#vars";

type ConfigKey = "BETTER_AUTH_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET" | "LOCAL_DEV" | "PUBLIC_URL";

type RuntimeBindings = Omit<Cloudflare.Env, ConfigKey> &
	Partial<Record<ConfigKey, string>> & {
		VARS_ENV?: string;
		VARS_KEY?: string;
	};

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
	const bindings = getBindings();
	if (bindings.VARS_ENV && bindings.VARS_KEY) {
		const vars = await getVars(bindings);
		return {
			BETTER_AUTH_SECRET: vars.BETTER_AUTH_SECRET.unwrap(),
			GITHUB_CLIENT_ID: vars.GITHUB_CLIENT_ID.unwrap() || undefined,
			GITHUB_CLIENT_SECRET: vars.GITHUB_CLIENT_SECRET.unwrap() || undefined,
			LOCAL_DEV: vars.LOCAL_DEV,
			PUBLIC_URL: vars.PUBLIC_URL,
		};
	}

	if (!bindings.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required.");
	if (!bindings.PUBLIC_URL) throw new Error("PUBLIC_URL is required.");
	return {
		BETTER_AUTH_SECRET: bindings.BETTER_AUTH_SECRET,
		GITHUB_CLIENT_ID: bindings.GITHUB_CLIENT_ID || undefined,
		GITHUB_CLIENT_SECRET: bindings.GITHUB_CLIENT_SECRET || undefined,
		LOCAL_DEV: bindings.LOCAL_DEV ?? "false",
		PUBLIC_URL: bindings.PUBLIC_URL,
	};
}

export function getDb() {
	return createDb(env.DB);
}
