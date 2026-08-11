import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "#/lib/runtime.server";

export const Route = createFileRoute("/api/dev/sign-in")({
	server: {
		handlers: {
			POST: async () => {
				const runtime = getRuntimeEnv();
				if (runtime.LOCAL_DEV !== "true") return new Response("Not Found", { status: 404 });
				await runtime.DB.batch([
					runtime.DB.prepare(
						"insert or ignore into user (id, name, email, email_verified, created_at, updated_at) values ('user_demo', 'Demo User', 'demo@plantifiles.local', 1, unixepoch(), unixepoch())",
					),
					runtime.DB.prepare(
						"insert or ignore into workspace (id, slug, name, required_approvals) values ('workspace_demo', 'demo', 'Demo', 1)",
					),
					runtime.DB.prepare(
						"insert or ignore into membership (id, user_id, workspace_id, role) values ('membership_demo', 'user_demo', 'workspace_demo', 'owner')",
					),
				]);
				return new Response(null, {
					status: 303,
					headers: {
						Location: "/w/demo",
						"Set-Cookie": "pf_dev_user=user_demo; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
					},
				});
			},
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
