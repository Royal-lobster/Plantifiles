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
	CLERK_OAUTH_CLIENT_ID: string;
	CLERK_OAUTH_ISSUER: string;
	CLERK_SECRET_KEY: string;
	CLERK_WEBHOOK_SIGNING_SECRET: string;
	PUBLIC_URL: string;
};

export function getBindings(): RuntimeBindings {
	return env as RuntimeBindings;
}

/**
 * A Clerk publishable key carries its own Frontend API host: `pk_test_`/`pk_live_`
 * followed by base64 of `<host>$`. Deriving the OAuth issuer from it means the
 * issuer and the key can never name different Clerk instances, and the CLI
 * discovery endpoint needs no configuration of its own.
 */
function oauthIssuer(publishableKey: string): string {
	const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
	const host = atob(encoded).replace(/\$$/, "");
	if (!host) throw new Error("Clerk publishable key does not encode a Frontend API host.");
	return `https://${host}`;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
	const vars = await getVars(getVarsBindings());
	return {
		CLERK_PUBLISHABLE_KEY: vars.CLERK_PUBLISHABLE_KEY,
		CLERK_OAUTH_CLIENT_ID: vars.CLERK_OAUTH_CLIENT_ID.unwrap(),
		CLERK_OAUTH_ISSUER: oauthIssuer(vars.CLERK_PUBLISHABLE_KEY),
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
