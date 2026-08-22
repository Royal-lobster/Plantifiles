import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	authObject: {} as Record<string, unknown>,
}));

vi.mock("@clerk/tanstack-react-start/server", () => ({
	auth: async () => runtime.authObject,
	clerkClient: () => ({
		users: {
			getUser: async () => ({
				id: "user_clerk",
				firstName: "Plant",
				lastName: "User",
				username: "plant-user",
				imageUrl: "https://images.example/user.png",
				primaryEmailAddressId: "email_1",
				emailAddresses: [{ id: "email_1", emailAddress: "user@example.com", verification: { status: "verified" } }],
			}),
		},
	}),
}));

vi.mock("#/lib/data/clerk-projection.server", () => ({
	resolveClerkUser: async () => ({ id: "user_local", name: "Plant User", email: "user@example.com", image: null }),
	resolveClerkOrganizationMembership: async () => {
		throw new Error("OAuth tokens must not project an active browser organization.");
	},
}));

vi.mock("./runtime.server", () => ({
	getRuntimeConfig: async () => ({
		CLERK_PUBLISHABLE_KEY: "pk_test",
		CLERK_SECRET_KEY: "sk_test",
		CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
		CLERK_OAUTH_CLIENT_ID: "client_test",
		CLERK_OAUTH_ISSUER: "https://clerk.example",
		LOCAL_DEV: "false",
		PUBLIC_URL: "https://plans.example",
	}),
	getDb: () => {
		throw new Error("Production Clerk authentication should not query a token table.");
	},
}));

import { authenticateRequest } from "./request-auth.server";

beforeEach(() => {
	runtime.authObject = {
		isAuthenticated: true,
		tokenType: "oauth_token",
		userId: "user_clerk",
		clientId: "client_test",
		subject: "user_clerk",
		scopes: ["plantifiles:read"],
	};
});

describe("authenticateRequest", () => {
	it("projects a scoped Clerk OAuth identity", async () => {
		await expect(
			authenticateRequest(new Request("https://plans.example/api/plans"), "plantifiles:read"),
		).resolves.toEqual({
			user: { id: "user_local", name: "Plant User", email: "user@example.com", image: null },
			method: "oauth",
			scopes: ["plantifiles:read"],
		});
	});

	it("rejects OAuth credentials without the required scope", async () => {
		try {
			await authenticateRequest(new Request("https://plans.example/api/plans"), "plantifiles:write");
			throw new Error("Expected scope rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(Response);
			expect((error as Response).status).toBe(403);
		}
	});

	it("rejects Organization API keys because mutations require a user author", async () => {
		runtime.authObject = {
			isAuthenticated: true,
			tokenType: "api_key",
			subject: "org_123",
			userId: null,
			orgId: "org_123",
			scopes: ["plantifiles:write"],
		};

		try {
			await authenticateRequest(new Request("https://plans.example/api/plans"), "plantifiles:write");
			throw new Error("Expected subject rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(Response);
			expect((error as Response).status).toBe(403);
		}
	});
});
