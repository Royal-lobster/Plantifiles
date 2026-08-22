import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createApiToken, listApiTokens, revokeApiToken } from "#/lib/data/tokens.server";

export type TokenListItem = {
	id: string;
	name: string;
	prefix: string | null;
	expiresAt: string | null;
	lastUsedAt: string | null;
};

export const getTokensForPage = createServerFn({ method: "GET" }).handler(async (): Promise<TokenListItem[]> => {
	const tokens = await listApiTokens(getRequest());
	return tokens.map((token) => ({
		...token,
		expiresAt: token.expiresAt?.toISOString() ?? null,
		lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
	}));
});

export const createTokenForPage = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1).max(80) }))
	.handler(({ data }) => createApiToken(getRequest(), data.name));

export const revokeTokenForPage = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		await revokeApiToken(getRequest(), data.id);
		return { ok: true };
	});
