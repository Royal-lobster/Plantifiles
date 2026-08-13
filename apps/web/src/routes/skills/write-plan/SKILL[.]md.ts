import { createFileRoute } from "@tanstack/react-router";
import skill from "../../../../../../skills/write-plan/SKILL.md?raw";

export const Route = createFileRoute("/skills/write-plan/SKILL.md")({
	server: {
		handlers: {
			GET: () =>
				new Response(skill, {
					headers: {
						"Cache-Control": "public, max-age=300",
						"Content-Disposition": 'attachment; filename="SKILL.md"',
						"Content-Type": "text/markdown; charset=utf-8",
					},
				}),
			ANY: () => new Response("Method Not Allowed", { status: 405 }),
		},
	},
});
