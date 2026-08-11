import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createApiToken, listApiTokens, revokeApiToken } from "./tokens.server";

export const getTokensForPage = createServerFn({ method: "GET" }).handler(async () => {
	const tokens = await listApiTokens(getRequest());
	return tokens.map((token) => ({ ...token, lastUsedAt: token.lastUsedAt?.toISOString() ?? null }));
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
