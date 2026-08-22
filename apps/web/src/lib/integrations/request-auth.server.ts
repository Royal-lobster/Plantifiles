import { createHash } from "node:crypto";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { apiToken, user } from "@plantifiles/db/schema";
import { eq } from "drizzle-orm";
import { resolveClerkOrganizationMembership, resolveClerkUser } from "#/lib/data/clerk-projection.server";
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
			.select({ tokenId: apiToken.id, expiresAt: apiToken.expiresAt, user: requestUserSelection })
			.from(apiToken)
			.innerJoin(user, eq(apiToken.userId, user.id))
			.where(eq(apiToken.tokenHash, tokenHash))
			.limit(1);
		const match = rows[0];
		if (!match) return null;
		// Delete rather than reject-and-keep: an expired token can never be
		// revived, so leaving the row behind only grows the table and the list UI.
		if (match.expiresAt && match.expiresAt.getTime() <= Date.now()) {
			await db.delete(apiToken).where(eq(apiToken.id, match.tokenId));
			throw new Response("Token expired. Run `plantifiles login` again.", { status: 401 });
		}
		await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, match.tokenId));
		return { user: match.user, method: "bearer" };
	}

	const runtime = await getRuntimeConfig();

	const clerkIdentity = await auth();
	if (!clerkIdentity.userId) return null;
	if (!runtime.CLERK_PUBLISHABLE_KEY || !runtime.CLERK_SECRET_KEY) {
		throw new Error("Clerk API credentials are required to project an authenticated session.");
	}

	const clerkUser = await clerkClient({
		publishableKey: runtime.CLERK_PUBLISHABLE_KEY,
		secretKey: runtime.CLERK_SECRET_KEY,
	}).users.getUser(clerkIdentity.userId);
	let localUser = await resolveClerkUser({
		id: clerkUser.id,
		firstName: clerkUser.firstName,
		lastName: clerkUser.lastName,
		username: clerkUser.username,
		imageUrl: clerkUser.imageUrl,
		primaryEmailAddressId: clerkUser.primaryEmailAddressId,
		emailAddresses: clerkUser.emailAddresses.map((emailAddress) => ({
			id: emailAddress.id,
			emailAddress: emailAddress.emailAddress,
			verification: emailAddress.verification ? { status: emailAddress.verification.status } : null,
		})),
	});

	const hasActiveOrganization = clerkIdentity.orgId || clerkIdentity.orgSlug || clerkIdentity.orgRole;
	if (hasActiveOrganization) {
		if (!clerkIdentity.orgId || !clerkIdentity.orgSlug || !clerkIdentity.orgRole) {
			throw new Error("Clerk returned an incomplete active organization.");
		}
		if (clerkIdentity.orgRole !== "org:admin" && clerkIdentity.orgRole !== "org:member") {
			throw new Response("Unsupported organization role", { status: 403 });
		}
		const membership = await resolveClerkOrganizationMembership({
			clerkUserId: clerkIdentity.userId,
			clerkOrganizationId: clerkIdentity.orgId,
			organizationSlug: clerkIdentity.orgSlug,
			organizationRole: clerkIdentity.orgRole,
		});
		localUser = membership.user;
	}

	return { user: localUser, method: "session" };
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
