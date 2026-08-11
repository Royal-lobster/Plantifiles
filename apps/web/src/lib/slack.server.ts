import {
	approval,
	decision,
	membership,
	plan,
	planVersion,
	slackInstallation,
	workspace,
} from "@plantifiles/db/schema";
import { and, count, eq, or } from "drizzle-orm";
import { getDb, getRuntimeEnv } from "./runtime.server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1_000;
const SLACK_REQUEST_TOLERANCE_SECONDS = 5 * 60;
const TOKEN_AAD = encoder.encode("plantifiles:slack-token:v1");

type OAuthState = {
	workspaceId: string;
	userId: string;
	expiresAt: number;
};

type SlackOAuthResponse = {
	ok: boolean;
	error?: string;
	access_token?: string;
	bot_user_id?: string;
	team?: { id?: string; name?: string };
};

type SlackLinkSharedEvent = {
	type: "link_shared";
	channel?: string;
	channel_id?: string;
	message_ts?: string;
	ts?: string;
	unfurl_id?: string;
	source?: string;
	links: Array<{ domain?: string; url: string }>;
};

export type SlackEventEnvelope = {
	type: "event_callback";
	team_id: string;
	event_id?: string;
	event: SlackLinkSharedEvent | { type: string };
};

function requiredSecret(
	name: "BETTER_AUTH_SECRET" | "SLACK_CLIENT_ID" | "SLACK_CLIENT_SECRET" | "SLACK_SIGNING_SECRET",
) {
	const value = getRuntimeEnv()[name];
	if (!value) throw new Error(`${name} is not configured`);
	return value;
}

function slackApiBaseUrl(): string {
	return (getRuntimeEnv().SLACK_API_URL ?? "https://slack.com/api").replace(/\/$/, "");
}

function publicUrl(): URL {
	return new URL(getRuntimeEnv().PUBLIC_URL);
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const padded = value
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function fromHex(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[0-9a-f]{64}$/i.test(value)) return null;
	const bytes = new Uint8Array(value.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
}

async function sign(value: string, secret: string): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value)));
}

async function aesKey(): Promise<CryptoKey> {
	const material = await crypto.subtle.digest("SHA-256", encoder.encode(requiredSecret("BETTER_AUTH_SECRET")));
	return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptAccessToken(token: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: TOKEN_AAD },
		await aesKey(),
		encoder.encode(token),
	);
	return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

async function decryptAccessToken(encrypted: string): Promise<string> {
	const [version, ivValue, ciphertextValue] = encrypted.split(".");
	if (version !== "v1" || !ivValue || !ciphertextValue) throw new Error("Unsupported Slack token ciphertext");
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64Url(ivValue), additionalData: TOKEN_AAD },
		await aesKey(),
		fromBase64Url(ciphertextValue),
	);
	return decoder.decode(plaintext);
}

export async function createSlackOAuthState(workspaceId: string, userId: string): Promise<string> {
	const state: OAuthState = { workspaceId, userId, expiresAt: Date.now() + OAUTH_STATE_LIFETIME_MS };
	const payload = base64Url(encoder.encode(JSON.stringify(state)));
	const signature = await sign(payload, requiredSecret("BETTER_AUTH_SECRET"));
	return `${payload}.${base64Url(signature)}`;
}

export async function verifySlackOAuthState(value: string): Promise<OAuthState | null> {
	const [payload, signatureValue, extra] = value.split(".");
	if (!payload || !signatureValue || extra) return null;
	try {
		const valid = await crypto.subtle.verify(
			"HMAC",
			await hmacKey(requiredSecret("BETTER_AUTH_SECRET")),
			fromBase64Url(signatureValue),
			encoder.encode(payload),
		);
		if (!valid) return null;
		const state = JSON.parse(decoder.decode(fromBase64Url(payload))) as Partial<OAuthState>;
		if (
			typeof state.workspaceId !== "string" ||
			typeof state.userId !== "string" ||
			typeof state.expiresAt !== "number" ||
			state.expiresAt < Date.now()
		) {
			return null;
		}
		return state as OAuthState;
	} catch {
		return null;
	}
}

export function slackOAuthRedirectUri(): string {
	return new URL("/api/slack/callback", publicUrl()).toString();
}

export async function slackAuthorizeUrl(workspaceId: string, userId: string): Promise<string> {
	const url = new URL("https://slack.com/oauth/v2/authorize");
	url.searchParams.set("client_id", requiredSecret("SLACK_CLIENT_ID"));
	url.searchParams.set("scope", "links:read,links:write");
	url.searchParams.set("redirect_uri", slackOAuthRedirectUri());
	url.searchParams.set("state", await createSlackOAuthState(workspaceId, userId));
	return url.toString();
}

export async function completeSlackOAuth(
	code: string,
	state: OAuthState,
): Promise<{ workspaceSlug: string; teamName: string }> {
	const body = new FormData();
	body.set("code", code);
	body.set("client_id", requiredSecret("SLACK_CLIENT_ID"));
	body.set("client_secret", requiredSecret("SLACK_CLIENT_SECRET"));
	body.set("redirect_uri", slackOAuthRedirectUri());
	const response = await fetch(`${slackApiBaseUrl()}/oauth.v2.access`, { method: "POST", body });
	const payload = (await response.json()) as SlackOAuthResponse;
	const teamId = payload.team?.id;
	const accessToken = payload.access_token;
	if (!response.ok || !payload.ok || !teamId || !accessToken) {
		throw new Error(`Slack OAuth failed: ${payload.error ?? response.status}`);
	}

	const db = getDb();
	const [targetWorkspace] = await db
		.select({ id: workspace.id, slug: workspace.slug })
		.from(workspace)
		.where(eq(workspace.id, state.workspaceId))
		.limit(1);
	if (!targetWorkspace) throw new Error("Workspace not found");
	const [conflict] = await db
		.select({ workspaceId: slackInstallation.workspaceId })
		.from(slackInstallation)
		.where(or(eq(slackInstallation.teamId, teamId), eq(slackInstallation.workspaceId, state.workspaceId)))
		.limit(1);
	if (conflict && conflict.workspaceId !== state.workspaceId) {
		throw new Error("That Slack workspace is already connected to another Plantifiles workspace");
	}

	const encryptedAccessToken = await encryptAccessToken(accessToken);
	const now = new Date();
	await db
		.insert(slackInstallation)
		.values({
			id: crypto.randomUUID(),
			workspaceId: state.workspaceId,
			teamId,
			teamName: payload.team?.name ?? null,
			botUserId: payload.bot_user_id ?? null,
			encryptedAccessToken,
			installedById: state.userId,
		})
		.onConflictDoUpdate({
			target: slackInstallation.workspaceId,
			set: {
				teamId,
				teamName: payload.team?.name ?? null,
				botUserId: payload.bot_user_id ?? null,
				encryptedAccessToken,
				installedById: state.userId,
				updatedAt: now,
			},
		});
	return { workspaceSlug: targetWorkspace.slug, teamName: payload.team?.name ?? teamId };
}

export async function verifySlackRequest(
	rawBody: string,
	headers: Headers,
	nowSeconds = Date.now() / 1_000,
): Promise<boolean> {
	const timestamp = headers.get("x-slack-request-timestamp");
	const supplied = headers.get("x-slack-signature");
	if (!timestamp || !supplied?.startsWith("v0=")) return false;
	const timestampSeconds = Number(timestamp);
	if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > SLACK_REQUEST_TOLERANCE_SECONDS) {
		return false;
	}
	const signature = fromHex(supplied.slice(3));
	if (!signature) return false;
	return crypto.subtle.verify(
		"HMAC",
		await hmacKey(requiredSecret("SLACK_SIGNING_SECRET")),
		signature,
		encoder.encode(`v0:${timestamp}:${rawBody}`),
	);
}

function parsePlanUrl(value: string): { workspaceSlug: string; planSlug: string } | null {
	try {
		const candidate = new URL(value);
		if (candidate.origin !== publicUrl().origin) return null;
		const parts = candidate.pathname.split("/").filter(Boolean).map(decodeURIComponent);
		if (parts[0] !== "p" || !parts[1] || !parts[2]) return null;
		if (parts.length !== 3 && !(parts.length === 5 && parts[3] === "v" && /^\d+$/.test(parts[4] ?? ""))) return null;
		return { workspaceSlug: parts[1], planSlug: parts[2] };
	} catch {
		return null;
	}
}

function slackText(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function loadUnfurl(workspaceId: string, value: string) {
	const parsed = parsePlanUrl(value);
	if (!parsed) return null;
	const db = getDb();
	const [row] = await db
		.select({
			id: plan.id,
			title: plan.title,
			status: plan.status,
			version: planVersion.number,
			lintReport: planVersion.lintReport,
			versionId: planVersion.id,
			requiredApprovals: workspace.requiredApprovals,
		})
		.from(plan)
		.innerJoin(workspace, eq(plan.workspaceId, workspace.id))
		.innerJoin(planVersion, eq(plan.currentVersionId, planVersion.id))
		.where(
			and(eq(plan.workspaceId, workspaceId), eq(workspace.slug, parsed.workspaceSlug), eq(plan.slug, parsed.planSlug)),
		)
		.limit(1);
	if (!row) return null;
	const [[openDecisionCount], [approvalCount]] = await Promise.all([
		db
			.select({ value: count() })
			.from(decision)
			.where(and(eq(decision.planId, row.id), eq(decision.status, "open"))),
		db.select({ value: count() }).from(approval).where(eq(approval.versionId, row.versionId)),
	]);
	const report = row.lintReport as { readTimeMinutes?: unknown };
	const readTime = typeof report.readTimeMinutes === "number" ? Math.max(1, Math.ceil(report.readTimeMinutes)) : 1;
	const openDecisions = openDecisionCount?.value ?? 0;
	const approvals = approvalCount?.value ?? 0;
	const pendingApprovals = Math.max(0, row.requiredApprovals - approvals);
	const details = [
		row.status.toUpperCase().replaceAll("_", " "),
		`v${row.version}`,
		`${readTime} min read`,
		`${openDecisions} open decision${openDecisions === 1 ? "" : "s"}`,
		`${pendingApprovals} pending approval${pendingApprovals === 1 ? "" : "s"}`,
	].join("  ·  ");
	return {
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text: `*${slackText(row.title)}*` } },
			{ type: "context", elements: [{ type: "mrkdwn", text: details }] },
		],
	};
}

export async function processSlackEvent(envelope: SlackEventEnvelope): Promise<void> {
	if (envelope.event.type !== "link_shared") return;
	const db = getDb();
	const [installation] = await db
		.select()
		.from(slackInstallation)
		.where(eq(slackInstallation.teamId, envelope.team_id))
		.limit(1);
	if (!installation) return;

	const event = envelope.event as SlackLinkSharedEvent;
	const entries = await Promise.all(
		event.links.map(async (link) => [link.url, await loadUnfurl(installation.workspaceId, link.url)] as const),
	);
	const unfurls = Object.fromEntries(
		entries.filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null),
	);
	if (Object.keys(unfurls).length === 0) return;

	const context =
		event.unfurl_id && event.source
			? { unfurl_id: event.unfurl_id, source: event.source }
			: { channel: event.channel ?? event.channel_id, ts: event.message_ts ?? event.ts };
	if (!("unfurl_id" in context) && (!context.channel || !context.ts)) return;
	const response = await fetch(`${slackApiBaseUrl()}/chat.unfurl`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await decryptAccessToken(installation.encryptedAccessToken)}`,
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({ ...context, unfurls }),
	});
	const payload = (await response.json()) as { ok?: boolean; error?: string };
	if (!response.ok || !payload.ok) throw new Error(`Slack unfurl failed: ${payload.error ?? response.status}`);
}

export async function findSlackInstallTarget(workspaceSlug: string, userId: string) {
	const [target] = await getDb()
		.select({ id: workspace.id, role: membership.role })
		.from(workspace)
		.innerJoin(membership, eq(workspace.id, membership.workspaceId))
		.where(and(eq(workspace.slug, workspaceSlug), eq(membership.userId, userId)))
		.limit(1);
	if (!target) throw new Response("Workspace not found", { status: 404 });
	if (target.role !== "owner" && target.role !== "admin") throw new Response("Forbidden", { status: 403 });
	return target;
}
