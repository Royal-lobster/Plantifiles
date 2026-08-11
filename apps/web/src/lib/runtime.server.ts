import { env } from "cloudflare:workers";
import { createDb } from "@plantifiles/db";

type SecretEnv = Cloudflare.Env & {
	BETTER_AUTH_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	ANTHROPIC_API_KEY?: string;
	SLACK_CLIENT_ID?: string;
	SLACK_CLIENT_SECRET?: string;
	SLACK_SIGNING_SECRET?: string;
	SLACK_API_URL?: string;
};

export function getRuntimeEnv(): SecretEnv {
	return env as SecretEnv;
}

export function getDb() {
	return createDb(env.DB);
}
