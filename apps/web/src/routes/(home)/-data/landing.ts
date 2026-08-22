import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { listWorkspacesForUser } from "#/lib/data/workspaces.server";
import { authenticateRequest } from "#/lib/integrations/request-auth.server";

export type LandingDestination =
	| { kind: "sign-in" }
	| { kind: "create-organization" }
	| { kind: "workspace"; slug: string };

export const getLandingDestination = createServerFn({ method: "GET" }).handler(
	async (): Promise<LandingDestination> => {
		const identity = await authenticateRequest(getRequest());
		if (!identity) return { kind: "sign-in" };
		const workspaces = await listWorkspacesForUser(identity.user);
		const workspace = workspaces[0];
		return workspace ? { kind: "workspace", slug: workspace.slug } : { kind: "create-organization" };
	},
);
