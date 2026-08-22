import { getVars } from "#vars";
import { createDb } from "@plantifiles/db";
import { env } from "cloudflare:workers";

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
	LOCAL_DEV: string;
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
		LOCAL_DEV: String(vars.LOCAL_DEV),
		PUBLIC_URL: vars.PUBLIC_URL,
	};
}

function getVarsBindings(): VarsBindings {
	const bindings = getBindings();
	const varsEnv = bindings.VARS_ENV ?? (import.meta.env.DEV ? process.env.VARS_ENV : undefined);
	const varsKey = bindings.VARS_KEY ?? (import.meta.env.DEV ? process.env.VARS_KEY : undefined);
	return {
		...(varsEnv ? { VARS_ENV: varsEnv } : {}),
		...(varsKey ? { VARS_KEY: varsKey } : {}),
	};
}

export function getDb() {
	return createDb(env.DB);
}
