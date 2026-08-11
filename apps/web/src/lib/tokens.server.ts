import { createHash, randomBytes } from "node:crypto";
import { apiToken } from "@plantifiles/db/schema";
import { and, eq } from "drizzle-orm";
import { requireIdentity } from "./request-auth.server";
import { getDb } from "./runtime.server";

export async function createApiToken(request: Request, name: string) {
	const identity = await requireIdentity(request);
	if (identity.method !== "session") throw new Response("Session authentication required", { status: 403 });
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

export async function listApiTokens(request: Request) {
	const identity = await requireIdentity(request);
	if (identity.method !== "session") throw new Response("Session authentication required", { status: 403 });
	return getDb()
		.select({ id: apiToken.id, name: apiToken.name, lastUsedAt: apiToken.lastUsedAt })
		.from(apiToken)
		.where(eq(apiToken.userId, identity.user.id));
}

export async function revokeApiToken(request: Request, id: string) {
	const identity = await requireIdentity(request);
	if (identity.method !== "session") throw new Response("Session authentication required", { status: 403 });
	await getDb()
		.delete(apiToken)
		.where(and(eq(apiToken.id, id), eq(apiToken.userId, identity.user.id)));
}
