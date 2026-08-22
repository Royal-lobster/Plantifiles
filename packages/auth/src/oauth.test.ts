import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore, PlantifilesAuth, resolveConnection } from "./index.js";

const serviceConfig = {
	issuer: "https://clerk.example",
	clientId: "client_plantifiles",
	redirectUri: "https://plans.example/cli/callback",
	scopes: ["openid", "profile", "offline_access", "plantifiles:read", "plantifiles:write"],
};

describe("PlantifilesAuth", () => {
	it("completes PKCE login, refreshes once, and revokes the refresh token", async () => {
		let now = 1_000_000;
		let authorizationUrl: URL | undefined;
		const tokenGrants: string[] = [];
		let revokedToken: string | undefined;
		const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : input.toString());
			if (url.pathname === "/api/auth/cli") return Response.json(serviceConfig);
			if (url.pathname === "/oauth/token") {
				const body = new URLSearchParams(String(init?.body));
				const grant = body.get("grant_type") ?? "";
				tokenGrants.push(grant);
				if (grant === "authorization_code") {
					expect(body.get("code")).toBe("authorization-code");
					expect(body.get("redirect_uri")).toBe(serviceConfig.redirectUri);
					const verifier = body.get("code_verifier");
					expect(verifier).toBeTruthy();
					expect(
						createHash("sha256")
							.update(verifier ?? "")
							.digest("base64url"),
					).toBe(authorizationUrl?.searchParams.get("code_challenge"));
					return Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 60 });
				}
				expect(body.get("refresh_token")).toBe("refresh-1");
				return Response.json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 });
			}
			if (url.pathname === "/oauth/userinfo") {
				expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-1");
				return Response.json({ sub: "user_123", email: "dev@example.com" });
			}
			if (url.pathname === "/oauth/token/revoke") {
				revokedToken = new URLSearchParams(String(init?.body)).get("token") ?? undefined;
				return new Response(null, { status: 200 });
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		const auth = new PlantifilesAuth("https://plans.example", {
			store: new MemoryCredentialStore(),
			fetch: fetchMock as typeof fetch,
			now: () => now,
		});

		const user = await auth.login({
			async openBrowser(url) {
				authorizationUrl = new URL(url);
			},
			async readAuthorizationResponse() {
				return new URLSearchParams({
					code: "authorization-code",
					state: authorizationUrl?.searchParams.get("state") ?? "",
				}).toString();
			},
		});

		expect(user).toEqual({ sub: "user_123", email: "dev@example.com" });
		expect(authorizationUrl?.pathname).toBe("/oauth/authorize");
		expect(authorizationUrl?.searchParams.get("code_challenge_method")).toBe("S256");
		expect(await auth.getAccessToken()).toBe("access-1");

		now += 31_000;
		expect(await Promise.all([auth.getAccessToken(), auth.getAccessToken()])).toEqual(["access-2", "access-2"]);
		expect(tokenGrants).toEqual(["authorization_code", "refresh_token"]);

		await auth.logout();
		expect(revokedToken).toBe("refresh-2");
		expect(await auth.getAccessToken()).toBeNull();
	});

	it("rejects a pasted response from a different login attempt", async () => {
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input instanceof Request ? input.url : input.toString());
			if (url.pathname === "/api/auth/cli") return Response.json(serviceConfig);
			throw new Error(`Unexpected request: ${url}`);
		});
		const auth = new PlantifilesAuth("https://plans.example", {
			store: new MemoryCredentialStore(),
			fetch: fetchMock as typeof fetch,
		});

		await expect(
			auth.login({
				async openBrowser() {},
				async readAuthorizationResponse() {
					return "code=stolen-code&state=wrong-state";
				},
			}),
		).rejects.toThrow("did not match this login attempt");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uses a Clerk API key environment override without an OAuth session", async () => {
		const connection = await resolveConnection({
			env: {
				PLANTIFILES_BASE_URL: "https://plans.example/path",
				PLANTIFILES_TOKEN: "ak_test",
				VARS_ENV: "dev",
			},
			store: new MemoryCredentialStore(),
		});

		expect(connection.baseUrl).toBe("https://plans.example");
		expect(await connection.getAccessToken()).toBe("ak_test");
	});
});
