import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { approveCliAuth, denyCliAuth, describeCliAuthRequest } from "#/lib/data/cli-auth.server";
import { requireSessionIdentity } from "#/lib/integrations/request-auth.server";

const codeSchema = z.object({ code: z.string().trim().min(1).max(16) });

export type CliApprovalPage = {
	user: { name: string; email: string };
	pending: { code: string; tokenName: string; expiresAt: string } | null;
	problem: string | null;
};

export const getCliApproval = createServerFn({ method: "GET" })
	.validator(z.object({ code: z.string().trim().max(16).optional() }))
	.handler(async ({ data }): Promise<CliApprovalPage> => {
		const request = getRequest();
		const identity = await requireSessionIdentity(request);
		const user = { name: identity.user.name, email: identity.user.email };
		if (!data.code) return { user, pending: null, problem: null };
		try {
			const pending = await describeCliAuthRequest(request, data.code);
			return {
				user,
				pending: { code: data.code, tokenName: pending.tokenName, expiresAt: pending.expiresAt.toISOString() },
				problem: null,
			};
		} catch (error) {
			// A bad code is the normal case for a mistyped digit, not a page failure,
			// so it comes back as copy the form can show above the input.
			if (error instanceof Response) return { user, pending: null, problem: await error.text() };
			throw error;
		}
	});

export const approveCliLogin = createServerFn({ method: "POST" })
	.validator(codeSchema)
	.handler(async ({ data }) => {
		const approved = await approveCliAuth(getRequest(), data.code);
		return { tokenName: approved.tokenName, expiresAt: approved.expiresAt.toISOString() };
	});

export const denyCliLogin = createServerFn({ method: "POST" })
	.validator(codeSchema)
	.handler(async ({ data }) => {
		await denyCliAuth(getRequest(), data.code);
		return { ok: true };
	});
