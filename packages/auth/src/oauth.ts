import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { CredentialStore } from "./credential-store.js";

const SESSION_KEY = "oauth-session";
const REFRESH_SKEW_MS = 30_000;

export type OAuthServiceConfig = {
	issuer: string;
	clientId: string;
	redirectUri: string;
	scopes: string[];
};

export type OAuthUser = {
	sub: string;
	email?: string;
	name?: string;
	preferred_username?: string;
};

type TokenSet = {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	scope?: string;
	tokenType?: string;
};

type StoredSession = {
	config: OAuthServiceConfig;
	tokens: TokenSet;
	user: OAuthUser;
};

type OAuthTokenResponse = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
	scope?: unknown;
	token_type?: unknown;
};

export type LoginInteraction = {
	openBrowser(url: string): Promise<void>;
	readAuthorizationResponse(): Promise<string>;
};

export type PlantifilesAuthOptions = {
	store: CredentialStore;
	apiKey?: string;
	fetch?: typeof fetch;
	now?: () => number;
};

export class PlantifilesAuth {
	readonly #baseUrl: string;
	readonly #store: CredentialStore;
	readonly #apiKey: string | undefined;
	readonly #fetch: typeof fetch;
	readonly #now: () => number;
	#refresh: Promise<string | null> | undefined;

	constructor(baseUrl: string, options: PlantifilesAuthOptions) {
		this.#baseUrl = new URL(baseUrl).origin;
		this.#store = options.store;
		this.#apiKey = options.apiKey?.trim() || undefined;
		this.#fetch = options.fetch ?? fetch;
		this.#now = options.now ?? Date.now;
	}

	async login(interaction: LoginInteraction): Promise<OAuthUser> {
		const config = await this.#readServiceConfig();
		const verifier = randomBytes(32).toString("base64url");
		const challenge = createHash("sha256").update(verifier).digest("base64url");
		const state = randomBytes(32).toString("base64url");
		const authorizeUrl = new URL("/oauth/authorize", config.issuer);
		authorizeUrl.search = new URLSearchParams({
			response_type: "code",
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			scope: config.scopes.join(" "),
			state,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}).toString();

		await interaction.openBrowser(authorizeUrl.toString());
		const authorizationResponse = parseAuthorizationResponse(await interaction.readAuthorizationResponse(), state);
		const tokens = await this.#requestTokens(config, {
			grant_type: "authorization_code",
			client_id: config.clientId,
			code: authorizationResponse.code,
			code_verifier: verifier,
			redirect_uri: config.redirectUri,
		});
		const user = await this.#fetchUser(config, tokens.accessToken);
		await this.#store.set(SESSION_KEY, JSON.stringify({ config, tokens, user } satisfies StoredSession));
		return user;
	}

	/** Where `login` actually stored the credential; the keychain may degrade to a file. */
	credentialLocation(): string {
		return this.#store.location();
	}

	async getAccessToken(): Promise<string | null> {
		if (this.#apiKey) return this.#apiKey;
		const session = await this.#readSession();
		if (!session) return null;
		if (!session.tokens.expiresAt || session.tokens.expiresAt >= this.#now() + REFRESH_SKEW_MS) {
			return session.tokens.accessToken;
		}
		if (!session.tokens.refreshToken) return null;
		this.#refresh ??= this.#refreshSession(session).finally(() => {
			this.#refresh = undefined;
		});
		return this.#refresh;
	}

	async whoami(): Promise<OAuthUser | null> {
		return (await this.#readSession())?.user ?? null;
	}

	async logout(): Promise<void> {
		const session = await this.#readSession();
		if (!session) return;
		if (session.tokens.refreshToken) {
			const response = await this.#fetch(new URL("/oauth/token/revoke", session.config.issuer), {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: session.config.clientId,
					token: session.tokens.refreshToken,
					token_type_hint: "refresh_token",
				}),
			});
			if (!response.ok) throw new Error(await oauthError(response, "Clerk could not revoke this login."));
		}
		await this.#store.delete(SESSION_KEY);
	}

	async #refreshSession(session: StoredSession): Promise<string | null> {
		const refreshToken = session.tokens.refreshToken;
		if (!refreshToken) return null;
		const refreshed = await this.#requestTokens(session.config, {
			grant_type: "refresh_token",
			client_id: session.config.clientId,
			refresh_token: refreshToken,
			scope: session.config.scopes.join(" "),
		});
		const nextSession: StoredSession = {
			...session,
			tokens: {
				...session.tokens,
				...refreshed,
				refreshToken: refreshed.refreshToken ?? refreshToken,
			},
		};
		await this.#store.set(SESSION_KEY, JSON.stringify(nextSession));
		return nextSession.tokens.accessToken;
	}

	async #readServiceConfig(): Promise<OAuthServiceConfig> {
		const response = await this.#fetch(`${this.#baseUrl}/api/auth/cli`, { headers: { accept: "application/json" } });
		if (!response.ok) throw new Error(await oauthError(response, "Plantifiles CLI login is not configured."));
		const body: unknown = await response.json();
		if (!body || typeof body !== "object") throw new Error("Plantifiles returned an invalid OAuth configuration.");
		const record = body as Record<string, unknown>;
		if (
			typeof record.issuer !== "string" ||
			typeof record.clientId !== "string" ||
			typeof record.redirectUri !== "string" ||
			!Array.isArray(record.scopes) ||
			!record.scopes.every((scope) => typeof scope === "string")
		) {
			throw new Error("Plantifiles returned an incomplete OAuth configuration.");
		}
		const issuer = new URL(record.issuer).origin;
		const redirectUri = new URL(record.redirectUri);
		if (redirectUri.origin !== this.#baseUrl) {
			throw new Error("Plantifiles returned an OAuth callback on a different service origin.");
		}
		return { issuer, clientId: record.clientId, redirectUri: redirectUri.toString(), scopes: record.scopes };
	}

	async #requestTokens(config: OAuthServiceConfig, values: Record<string, string>): Promise<TokenSet> {
		const response = await this.#fetch(new URL("/oauth/token", config.issuer), {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(values),
		});
		if (!response.ok) throw new Error(await oauthError(response, "Clerk rejected the OAuth token request."));
		const body = (await response.json()) as OAuthTokenResponse;
		if (typeof body.access_token !== "string" || !body.access_token) {
			throw new Error("Clerk's OAuth response did not include an access token.");
		}
		return {
			accessToken: body.access_token,
			...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
			...(typeof body.expires_in === "number" ? { expiresAt: this.#now() + body.expires_in * 1000 } : {}),
			...(typeof body.scope === "string" ? { scope: body.scope } : {}),
			...(typeof body.token_type === "string" ? { tokenType: body.token_type } : {}),
		};
	}

	async #fetchUser(config: OAuthServiceConfig, accessToken: string): Promise<OAuthUser> {
		const response = await this.#fetch(new URL("/oauth/userinfo", config.issuer), {
			headers: { authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) throw new Error(await oauthError(response, "Clerk could not identify the signed-in user."));
		const body = (await response.json()) as Record<string, unknown>;
		if (typeof body.sub !== "string" || !body.sub)
			throw new Error("Clerk's user information did not include a subject.");
		return {
			sub: body.sub,
			...(typeof body.email === "string" ? { email: body.email } : {}),
			...(typeof body.name === "string" ? { name: body.name } : {}),
			...(typeof body.preferred_username === "string" ? { preferred_username: body.preferred_username } : {}),
		};
	}

	async #readSession(): Promise<StoredSession | null> {
		const raw = await this.#store.get(SESSION_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") throw new Error("Stored Plantifiles credentials are invalid.");
		const session = parsed as Partial<StoredSession>;
		if (!session.config || !session.tokens?.accessToken || !session.user?.sub) {
			throw new Error("Stored Plantifiles credentials are incomplete. Run `plantifiles logout`, then sign in again.");
		}
		return session as StoredSession;
	}
}

function parseAuthorizationResponse(input: string, expectedState: string): { code: string } {
	const trimmed = input.trim();
	let params: URLSearchParams;
	try {
		params = /^https?:\/\//i.test(trimmed)
			? new URL(trimmed).searchParams
			: new URLSearchParams(trimmed.replace(/^\?/, ""));
	} catch {
		throw new Error("Paste the complete authorization code shown by Plantifiles.");
	}
	const oauthFailure = params.get("error_description") ?? params.get("error");
	if (oauthFailure) throw new Error(`Clerk authorization failed: ${oauthFailure}`);
	const state = params.get("state");
	const expected = Buffer.from(expectedState);
	const supplied = Buffer.from(state ?? "");
	if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
		throw new Error("The authorization response did not match this login attempt.");
	}
	const code = params.get("code");
	if (!code) throw new Error("The authorization response did not include a code.");
	return { code };
}

async function oauthError(response: Response, fallback: string): Promise<string> {
	const text = await response.text();
	if (!text.trim()) return fallback;
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		for (const key of ["error_description", "message", "error"] as const) {
			const detail = parsed[key];
			if (typeof detail === "string" && detail.trim()) return detail.trim();
		}
	} catch {
		return text.trim();
	}
	return fallback;
}
