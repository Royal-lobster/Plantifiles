import { describe, expect, it, vi } from "vitest";
import { negotiatePlanResponse } from "./content-negotiation";

const params = { workspaceSlug: "demo", planSlug: "billing" };

describe("plan content negotiation", () => {
	it("returns Markdown without invoking SSR for agent requests", async () => {
		const next = vi.fn(() => new Response("<html>SSR</html>"));
		const response = await negotiatePlanResponse(
			new Request("http://localhost/p/demo/billing", { headers: { Accept: "text/markdown" } }),
			params,
			next,
			async () => "---\ntitle: Billing\n---\n\n<TLDR>\nPlan.\n</TLDR>",
		);

		expect(next).not.toHaveBeenCalled();
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
		expect(response.headers.get("vary")).toBe("Accept");
		expect(await response.text()).toContain("<TLDR>");
	});

	it("defers HTML requests to the app router", async () => {
		const next = vi.fn(() => new Response("<html>SSR</html>", { headers: { "content-type": "text/html" } }));
		const load = vi.fn(async () => "markdown");
		const response = await negotiatePlanResponse(
			new Request("http://localhost/p/demo/billing", { headers: { Accept: "text/html" } }),
			params,
			next,
			load,
		);

		expect(next).toHaveBeenCalledOnce();
		expect(load).not.toHaveBeenCalled();
		expect(await response.text()).toContain("SSR");
	});

	it("lets a suffix or query parameter force Markdown", async () => {
		for (const url of ["http://localhost/p/demo/billing.md", "http://localhost/p/demo/billing?format=md"]) {
			const response = await negotiatePlanResponse(
				new Request(url, { headers: { Accept: "text/html" } }),
				{ ...params, planSlug: new URL(url).pathname.split("/").at(-1) ?? "billing" },
				() => new Response("SSR"),
				async () => "markdown",
			);
			expect(await response.text()).toBe("markdown");
		}
	});
});
