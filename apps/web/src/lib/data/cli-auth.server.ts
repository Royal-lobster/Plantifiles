import { createHash, randomBytes } from "node:crypto";
import { cliAuthRequest } from "@plantifiles/db/schema";
import { eq, lt } from "drizzle-orm";
import { requireSessionIdentity } from "#/lib/integrations/request-auth.server";
import { getDb, getRuntimeConfig } from "#/lib/integrations/runtime.server";
import { mintApiToken } from "./tokens.server";

/** Long enough to walk to a browser, short enough that an abandoned code stops mattering. */
const REQUEST_TTL_MS = 10 * 60 * 1000;

/** Seconds the CLI waits between polls. Enforced only as advice; the endpoint is cheap. */
export const POLL_INTERVAL_SECONDS = 3;

/**
 * Crockford's alphabet: exactly 32 symbols, so a random byte maps onto it without
 * modulo bias, and no pair of glyphs is confusable when read aloud over a call.
 */
const USER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CliAuthStart = {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	verificationUriComplete: string;
	expiresIn: number;
	interval: number;
};

export type CliAuthPending = { status: "pending" };
export type CliAuthIssued = { status: "issued"; token: string; baseUrl: string };

function generateUserCode(): string {
	const bytes = randomBytes(8);
	const characters = Array.from(bytes, (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
	return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

/**
 * Begin a device authorization. Deliberately unauthenticated: the caller is a
 * terminal that has no session yet, and the only thing it receives is a bearer
 * of nothing until a signed-in browser approves the matching user code.
 */
export async function startCliAuth(tokenName: string): Promise<CliAuthStart> {
	const db = getDb();
	// Piggyback the sweep on the only endpoint that creates rows, so expired
	// requests never accumulate and no scheduled worker is needed.
	await db.delete(cliAuthRequest).where(lt(cliAuthRequest.expiresAt, new Date()));

	const { PUBLIC_URL } = await getRuntimeConfig();
	const deviceCode = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);

	for (let attempt = 1; attempt <= 5; attempt += 1) {
		const userCode = generateUserCode();
		try {
			await db.insert(cliAuthRequest).values({
				id: crypto.randomUUID(),
				deviceCodeHash: createHash("sha256").update(deviceCode).digest("hex"),
				userCode,
				tokenName,
				expiresAt,
			});
			const verificationUri = `${PUBLIC_URL.replace(/\/$/, "")}/cli`;
			return {
				deviceCode,
				userCode,
				verificationUri,
				verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
				expiresIn: Math.floor(REQUEST_TTL_MS / 1000),
				interval: POLL_INTERVAL_SECONDS,
			};
		} catch (error) {
			const collided =
				error instanceof Error && /unique constraint failed: cli_auth_request\.user_code/i.test(error.message);
			if (!collided) throw error;
		}
	}
	throw new Response("Could not allocate a login code. Try again.", { status: 503 });
}

/**
 * Exchange a device code for the approved token, once. The row is deleted on the
 * poll that reads it, which bounds how long the plaintext sits in the database to
 * a single poll interval and makes replay impossible.
 */
export async function pollCliAuth(deviceCode: string): Promise<CliAuthPending | CliAuthIssued> {
	const db = getDb();
	const rows = await db
		.select({ id: cliAuthRequest.id, expiresAt: cliAuthRequest.expiresAt, issuedToken: cliAuthRequest.issuedToken })
		.from(cliAuthRequest)
		.where(eq(cliAuthRequest.deviceCodeHash, createHash("sha256").update(deviceCode).digest("hex")))
		.limit(1);
	const pendingRequest = rows[0];
	// A denied request is a deleted row, so "unknown" and "denied" are one answer
	// on purpose: neither tells a guessing caller whether a code ever existed.
	if (!pendingRequest) throw new Response("Login request expired or was denied.", { status: 404 });
	if (pendingRequest.expiresAt.getTime() <= Date.now()) {
		await db.delete(cliAuthRequest).where(eq(cliAuthRequest.id, pendingRequest.id));
		throw new Response("Login request expired or was denied.", { status: 404 });
	}
	if (!pendingRequest.issuedToken) return { status: "pending" };

	await db.delete(cliAuthRequest).where(eq(cliAuthRequest.id, pendingRequest.id));
	return {
		status: "issued",
		token: pendingRequest.issuedToken,
		baseUrl: (await getRuntimeConfig()).PUBLIC_URL.replace(/\/$/, ""),
	};
}

function normalizeUserCode(userCode: string): string {
	const bare = userCode
		.trim()
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, "");
	return `${bare.slice(0, 4)}-${bare.slice(4, 8)}`;
}

async function readPendingByUserCode(userCode: string) {
	const rows = await getDb()
		.select({
			id: cliAuthRequest.id,
			tokenName: cliAuthRequest.tokenName,
			expiresAt: cliAuthRequest.expiresAt,
			issuedToken: cliAuthRequest.issuedToken,
		})
		.from(cliAuthRequest)
		.where(eq(cliAuthRequest.userCode, normalizeUserCode(userCode)))
		.limit(1);
	const found = rows[0];
	if (!found || found.expiresAt.getTime() <= Date.now()) {
		throw new Response("That code is not valid. It may have expired.", { status: 404 });
	}
	if (found.issuedToken) throw new Response("That code was already approved.", { status: 409 });
	return found;
}

export async function describeCliAuthRequest(request: Request, userCode: string) {
	await requireSessionIdentity(request);
	const pendingRequest = await readPendingByUserCode(userCode);
	return { tokenName: pendingRequest.tokenName, expiresAt: pendingRequest.expiresAt };
}

/**
 * Approve from a signed-in browser. Requires a session rather than any identity:
 * a bearer token must not be able to mint a second, longer-lived bearer token.
 */
export async function approveCliAuth(request: Request, userCode: string) {
	const identity = await requireSessionIdentity(request);
	const pendingRequest = await readPendingByUserCode(userCode);
	const minted = await mintApiToken(identity.user.id, pendingRequest.tokenName);
	await getDb()
		.update(cliAuthRequest)
		.set({ userId: identity.user.id, issuedToken: minted.token })
		.where(eq(cliAuthRequest.id, pendingRequest.id));
	return { tokenName: pendingRequest.tokenName, expiresAt: minted.expiresAt };
}

export async function denyCliAuth(request: Request, userCode: string) {
	await requireSessionIdentity(request);
	const pendingRequest = await readPendingByUserCode(userCode);
	await getDb().delete(cliAuthRequest).where(eq(cliAuthRequest.id, pendingRequest.id));
}
