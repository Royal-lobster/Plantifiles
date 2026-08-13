import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getBindings, getRuntimeConfig } from "#/lib/integrations/runtime.server";

export const getLoginOptions = createServerFn({ method: "GET" }).handler(async () => ({
	localDev: (await getRuntimeConfig()).LOCAL_DEV === "true",
}));

export const signInAsDemoUser = createServerFn({ method: "POST" }).handler(async () => {
	const config = await getRuntimeConfig();
	if (config.LOCAL_DEV !== "true") throw new Response("Not Found", { status: 404 });
	const { DB } = getBindings();
	await DB.batch([
		DB.prepare(
			"insert or ignore into user (id, name, email, email_verified, created_at, updated_at) values ('user_demo', 'Demo User', 'demo@plantifiles.local', 1, unixepoch(), unixepoch())",
		),
		DB.prepare(
			"insert or ignore into workspace (id, slug, name, required_approvals) values ('workspace_demo', 'demo', 'Demo', 1)",
		),
		DB.prepare(
			"insert or ignore into membership (id, user_id, workspace_id, role) values ('membership_demo', 'user_demo', 'workspace_demo', 'owner')",
		),
	]);
	setCookie("pf_dev_user", "user_demo", {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		maxAge: 604_800,
	});
	return { workspaceSlug: "demo" };
});
