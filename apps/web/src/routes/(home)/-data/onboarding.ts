import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireIdentity } from "#/lib/integrations/request-auth.server";
import { getBindings } from "#/lib/integrations/runtime.server";

export const createWorkspace = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1), slug: z.string().regex(/^[a-z0-9-]+$/) }))
	.handler(async ({ data }) => {
		const identity = await requireIdentity(getRequest());
		const id = crypto.randomUUID();
		const runtime = getBindings();
		const insert = [
			runtime.DB.prepare("insert into workspace (id, slug, name, required_approvals) values (?, ?, ?, 1)").bind(
				id,
				data.slug,
				data.name,
			),
			runtime.DB.prepare("insert into membership (id, user_id, workspace_id, role) values (?, ?, ?, 'owner')").bind(
				crypto.randomUUID(),
				identity.user.id,
				id,
			),
		];
		try {
			await runtime.DB.batch(insert);
		} catch (error) {
			// workspace.slug is unique, and the raw D1 constraint text is not an
			// answer anyone can act on.
			if (error instanceof Error && /unique constraint failed: workspace\.slug/i.test(error.message)) {
				throw new Error(`The URL /w/${data.slug} is taken. Pick another one.`);
			}
			throw error;
		}
		return { slug: data.slug };
	});
