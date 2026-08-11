import { createHash } from "node:crypto";
import { apiToken, user } from "@plantifiles/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "./auth.server";
import { getDb } from "./runtime.server";

export type RequestIdentity = {
	user: typeof user.$inferSelect;
	method: "bearer" | "session";
};

export async function authenticateRequest(request: Request): Promise<RequestIdentity | null> {
	const authorization = request.headers.get("authorization");
	if (authorization?.startsWith("Bearer ")) {
		const plaintext = authorization.slice("Bearer ".length).trim();
		const tokenHash = createHash("sha256").update(plaintext).digest("hex");
		const db = getDb();
		const rows = await db
			.select({ token: apiToken, user })
			.from(apiToken)
			.innerJoin(user, eq(apiToken.userId, user.id))
			.where(eq(apiToken.tokenHash, tokenHash))
			.limit(1);
		const match = rows[0];
		if (!match) return null;
		await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, match.token.id));
		return { user: match.user, method: "bearer" };
	}

	const session = await getAuth().api.getSession({ headers: request.headers });
	if (!session) return null;
	return { user: session.user as typeof user.$inferSelect, method: "session" };
}

export async function requireIdentity(request: Request): Promise<RequestIdentity> {
	const identity = await authenticateRequest(request);
	if (!identity) throw new Response("Unauthorized", { status: 401 });
	return identity;
}
