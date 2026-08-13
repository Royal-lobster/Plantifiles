import { createHash } from "node:crypto";
import { apiToken, user } from "@plantifiles/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "./auth.server";
import { getDb, getRuntimeConfig } from "./runtime.server";

type RequestUser = {
	id: typeof user.$inferSelect.id;
	name: typeof user.$inferSelect.name;
	email: typeof user.$inferSelect.email;
	image: typeof user.$inferSelect.image;
};

type SessionIdentity = {
	user: RequestUser;
	method: "session";
};

type BearerIdentity = {
	user: RequestUser;
	method: "bearer";
};

export type RequestIdentity = SessionIdentity | BearerIdentity;

const requestUserSelection = {
	id: user.id,
	name: user.name,
	email: user.email,
	image: user.image,
};

export async function authenticateRequest(request: Request): Promise<RequestIdentity | null> {
	const authorization = request.headers.get("authorization");
	const bearerPrefix = "Bearer ";
	if (authorization?.slice(0, bearerPrefix.length).toLowerCase() === bearerPrefix.toLowerCase()) {
		const plaintext = authorization.slice(bearerPrefix.length).trim();
		const tokenHash = createHash("sha256").update(plaintext).digest("hex");
		const db = getDb();
		const rows = await db
			.select({ tokenId: apiToken.id, user: requestUserSelection })
			.from(apiToken)
			.innerJoin(user, eq(apiToken.userId, user.id))
			.where(eq(apiToken.tokenHash, tokenHash))
			.limit(1);
		const match = rows[0];
		if (!match) return null;
		await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, match.tokenId));
		return { user: match.user, method: "bearer" };
	}

	const runtime = await getRuntimeConfig();
	if (runtime.LOCAL_DEV === "true") {
		const devUserId = request.headers
			.get("cookie")
			?.split(";")
			.map((value) => value.trim().split("="))
			.find(([name]) => name === "pf_dev_user")?.[1];
		if (devUserId) {
			const users = await getDb()
				.select(requestUserSelection)
				.from(user)
				.where(eq(user.id, decodeURIComponent(devUserId)))
				.limit(1);
			if (users[0]) return { user: users[0], method: "session" };
		}
	}

	const session = await (await getAuth()).api.getSession({ headers: request.headers });
	if (!session) return null;
	return {
		user: {
			id: session.user.id,
			name: session.user.name,
			email: session.user.email,
			image: session.user.image ?? null,
		},
		method: "session",
	};
}

export async function requireIdentity(request: Request): Promise<RequestIdentity> {
	const identity = await authenticateRequest(request);
	if (!identity) throw new Response("Unauthorized", { status: 401 });
	return identity;
}

export async function requireSessionIdentity(request: Request): Promise<SessionIdentity> {
	const identity = await requireIdentity(request);
	if (identity.method !== "session") {
		throw new Response("Session authentication required", { status: 403 });
	}
	return identity;
}
