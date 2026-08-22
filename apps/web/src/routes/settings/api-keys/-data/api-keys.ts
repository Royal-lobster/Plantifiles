import { clerkClient } from "@clerk/tanstack-react-start/server";
import { user } from "@plantifiles/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireSessionIdentity } from "#/lib/integrations/request-auth.server";
import { getDb, getRuntimeConfig } from "#/lib/integrations/runtime.server";

const KEY_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

async function userApiKeys(request: Request) {
	const [identity, runtime] = await Promise.all([requireSessionIdentity(request), getRuntimeConfig()]);
	const rows = await getDb()
		.select({ clerkUserId: user.clerkUserId })
		.from(user)
		.where(eq(user.id, identity.user.id))
		.limit(1);
	const clerkUserId = rows[0]?.clerkUserId;
	if (!clerkUserId) throw new Error("The signed-in user is not linked to Clerk.");
	const client = clerkClient({
		publishableKey: runtime.CLERK_PUBLISHABLE_KEY,
		secretKey: runtime.CLERK_SECRET_KEY,
	});
	return { client, clerkUserId };
}

export type ApiKeyListItem = {
	id: string;
	name: string;
	scopes: string[];
	expiration: number | null;
	lastUsedAt: number | null;
};

export const listApiKeys = createServerFn({ method: "GET" }).handler(async (): Promise<ApiKeyListItem[]> => {
	const context = await userApiKeys(getRequest());
	const result = await context.client.apiKeys.list({ subject: context.clerkUserId, limit: 100 });
	return result.data.map((key) => ({
		id: key.id,
		name: key.name,
		scopes: key.scopes,
		expiration: key.expiration,
		lastUsedAt: key.lastUsedAt,
	}));
});

export const createApiKey = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1).max(80) }))
	.handler(async ({ data }) => {
		const context = await userApiKeys(getRequest());
		const key = await context.client.apiKeys.create({
			name: data.name,
			subject: context.clerkUserId,
			createdBy: context.clerkUserId,
			scopes: ["plantifiles:read", "plantifiles:write"],
			secondsUntilExpiration: KEY_LIFETIME_SECONDS,
		});
		if (!key.secret) throw new Error("Clerk created an API key without returning its secret.");
		return { name: key.name, secret: key.secret, expiration: key.expiration };
	});

export const revokeApiKey = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().min(1) }))
	.handler(async ({ data }) => {
		const context = await userApiKeys(getRequest());
		const key = await context.client.apiKeys.get(data.id);
		if (key.subject !== context.clerkUserId) throw new Response("API key not found.", { status: 404 });
		await context.client.apiKeys.revoke({ apiKeyId: data.id, revocationReason: "Revoked by user" });
		return { ok: true };
	});
