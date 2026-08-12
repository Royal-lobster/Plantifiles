import { env } from "cloudflare:workers";
import { createDb } from "@plantifiles/db";

type SecretEnv = Cloudflare.Env & {
	BETTER_AUTH_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
};

export function getRuntimeEnv(): SecretEnv {
	return env as SecretEnv;
}

export function getDb() {
	return createDb(env.DB);
}
