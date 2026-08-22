import { createHash, randomBytes } from "node:crypto";
import { apiToken } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSessionIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";

export type ApiTokenRecord = {
	id: string;
	name: string;
	prefix: string | null;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
};

/** Long enough that a lost laptop stops being a credential, short enough not to nag. */
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** `pf_` plus eight characters: enough to name a token in the revoke list, useless as a secret. */
const PREFIX_LENGTH = 11;

/**
 * The one place a token comes into existence. Both the settings form and the CLI
 * device grant call it, so neither can forget the expiry or the prefix.
 */
export async function mintApiToken(userId: string, name: string) {
	const token = `pf_${randomBytes(32).toString("base64url")}`;
	const id = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
	await getDb()
		.insert(apiToken)
		.values({
			id,
			userId,
			name,
			tokenHash: createHash("sha256").update(token).digest("hex"),
			prefix: token.slice(0, PREFIX_LENGTH),
			expiresAt,
		});
	return { id, name, token, expiresAt };
}

export async function createApiToken(request: Request, name: string) {
	const identity = await requireSessionIdentity(request);
	return mintApiToken(identity.user.id, name);
}

export async function listApiTokens(request: Request): Promise<ApiTokenRecord[]> {
	const identity = await requireSessionIdentity(request);
	return getDb()
		.select({
			id: apiToken.id,
			name: apiToken.name,
			prefix: apiToken.prefix,
			expiresAt: apiToken.expiresAt,
			lastUsedAt: apiToken.lastUsedAt,
		})
		.from(apiToken)
		.where(eq(apiToken.userId, identity.user.id));
}

export async function revokeApiToken(request: Request, id: string) {
	const identity = await requireSessionIdentity(request);
	await getDb()
		.delete(apiToken)
		.where(and(eq(apiToken.id, id), eq(apiToken.userId, identity.user.id)));
}
