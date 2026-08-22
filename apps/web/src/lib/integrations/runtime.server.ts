import { env } from "cloudflare:workers";
import { createDb } from "@plantifiles/db";
import { getVars } from "#vars";

type RuntimeBindings = Cloudflare.Env &
	Record<string, unknown> & {
		VARS_ENV?: string | undefined;
		VARS_KEY?: string | undefined;
	};
type VarsBindings = Parameters<typeof getVars>[0];

export type RuntimeConfig = {
	CLERK_PUBLISHABLE_KEY: string;
	CLERK_SECRET_KEY: string;
	CLERK_WEBHOOK_SIGNING_SECRET: string;
	PUBLIC_URL: string;
};

export function getBindings(): RuntimeBindings {
	return env as RuntimeBindings;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
	const vars = await getVars(getVarsBindings());
	return {
		CLERK_PUBLISHABLE_KEY: vars.CLERK_PUBLISHABLE_KEY,
		CLERK_SECRET_KEY: vars.CLERK_SECRET_KEY.unwrap(),
		CLERK_WEBHOOK_SIGNING_SECRET: vars.CLERK_WEBHOOK_SIGNING_SECRET.unwrap(),
		PUBLIC_URL: vars.PUBLIC_URL,
	};
}

function getVarsBindings(): VarsBindings {
	const bindings = getBindings();
	return {
		...(bindings.VARS_ENV ? { VARS_ENV: bindings.VARS_ENV } : {}),
		...(bindings.VARS_KEY ? { VARS_KEY: bindings.VARS_KEY } : {}),
	};
}

export function getDb() {
	return createDb(env.DB);
}
