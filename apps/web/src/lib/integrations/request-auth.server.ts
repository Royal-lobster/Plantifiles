import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { user } from "@plantifiles/db/schema";
import { resolveClerkOrganizationMembership, resolveClerkUser } from "#/lib/data/clerk-projection.server";
import { getRuntimeConfig } from "./runtime.server";

export type PlantifilesScope = "plantifiles:read" | "plantifiles:write";

type RequestUser = {
	id: typeof user.$inferSelect.id;
	name: typeof user.$inferSelect.name;
	email: typeof user.$inferSelect.email;
	image: typeof user.$inferSelect.image;
};

type SessionIdentity = {
	user: RequestUser;
	method: "session";
	scopes: PlantifilesScope[];
};

type MachineIdentity = {
	user: RequestUser;
	method: "oauth" | "api_key";
	scopes: string[];
};

export type RequestIdentity = SessionIdentity | MachineIdentity;

/**
 * Clerk's middleware puts the request in async context, so `auth()` reads it
 * without being handed one. The parameter stays because every data module
 * threads a request down to authorization; removing it is a separate change.
 */
export async function authenticateRequest(
	_request: Request,
	requiredScope?: PlantifilesScope,
): Promise<RequestIdentity | null> {
	const runtime = await getRuntimeConfig();
	const clerkIdentity = await auth({
		acceptsToken: ["session_token", "oauth_token", "api_key"],
	});
	if (!clerkIdentity.isAuthenticated) return null;
	if (!runtime.CLERK_PUBLISHABLE_KEY || !runtime.CLERK_SECRET_KEY) {
		throw new Error("Clerk API credentials are required to project an authenticated identity.");
	}

	let clerkUserId: string;
	let machineMethod: MachineIdentity["method"] | undefined;
	let scopes: string[] = [];
	if (clerkIdentity.tokenType === "api_key") {
		if (!clerkIdentity.userId) {
			throw new Response("Plantifiles accepts only user-scoped API keys.", { status: 403 });
		}
		clerkUserId = clerkIdentity.userId;
		machineMethod = "api_key";
		scopes = clerkIdentity.scopes;
	} else {
		clerkUserId = clerkIdentity.userId;
		if (clerkIdentity.tokenType === "oauth_token") {
			machineMethod = "oauth";
			scopes = clerkIdentity.scopes;
		}
	}

	if (requiredScope && machineMethod && !scopes.includes(requiredScope)) {
		throw new Response(`Credential missing the ${requiredScope} scope.`, { status: 403 });
	}

	const clerkUser = await clerkClient({
		publishableKey: runtime.CLERK_PUBLISHABLE_KEY,
		secretKey: runtime.CLERK_SECRET_KEY,
	}).users.getUser(clerkUserId);
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

	if (clerkIdentity.tokenType === "session_token") {
		const hasActiveOrganization = clerkIdentity.orgId || clerkIdentity.orgSlug || clerkIdentity.orgRole;
		if (hasActiveOrganization) {
			if (!clerkIdentity.orgId || !clerkIdentity.orgSlug || !clerkIdentity.orgRole) {
				throw new Error("Clerk returned an incomplete active organization.");
			}
			if (clerkIdentity.orgRole !== "org:admin" && clerkIdentity.orgRole !== "org:member") {
				throw new Response("Unsupported organization role", { status: 403 });
			}
			const membership = await resolveClerkOrganizationMembership({
				clerkUserId,
				clerkOrganizationId: clerkIdentity.orgId,
				organizationSlug: clerkIdentity.orgSlug,
				organizationRole: clerkIdentity.orgRole,
			});
			localUser = membership.user;
		}
		return { user: localUser, method: "session", scopes: ["plantifiles:read", "plantifiles:write"] };
	}

	if (!machineMethod) throw new Error("Clerk returned an unsupported credential type.");
	return { user: localUser, method: machineMethod, scopes };
}

export async function requireIdentity(request: Request, requiredScope?: PlantifilesScope): Promise<RequestIdentity> {
	const identity = await authenticateRequest(request, requiredScope);
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
