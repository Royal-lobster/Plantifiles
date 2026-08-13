import { createHash, randomBytes } from "node:crypto";
import { apiToken } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSessionIdentity } from "#/lib/integrations/request-auth.server";
import { getDb } from "#/lib/integrations/runtime.server";
export type ApiTokenRecord = {
	id: string;
	name: string;
	lastUsedAt: Date | null;
};

export async function createApiToken(request: Request, name: string) {
	const identity = await requireSessionIdentity(request);
	const token = `pf_${randomBytes(32).toString("base64url")}`;
	const id = crypto.randomUUID();
	await getDb()
		.insert(apiToken)
		.values({
			id,
			userId: identity.user.id,
			name,
			tokenHash: createHash("sha256").update(token).digest("hex"),
		});
	return { id, name, token };
}

export async function listApiTokens(request: Request): Promise<ApiTokenRecord[]> {
	const identity = await requireSessionIdentity(request);
	return getDb()
		.select({ id: apiToken.id, name: apiToken.name, lastUsedAt: apiToken.lastUsedAt })
		.from(apiToken)
		.where(eq(apiToken.userId, identity.user.id));
}

export async function revokeApiToken(request: Request, id: string) {
	const identity = await requireSessionIdentity(request);
	await getDb()
		.delete(apiToken)
		.where(and(eq(apiToken.id, id), eq(apiToken.userId, identity.user.id)));
}
