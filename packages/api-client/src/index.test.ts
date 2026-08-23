import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiError, PlantifilesClient } from "./index.js";

const client = new PlantifilesClient({ getAccessToken: () => "secret", baseUrl: "https://plans.example/" });

afterEach(() => vi.restoreAllMocks());

describe("PlantifilesClient", () => {
	it("uses one authenticated JSON transport for publication", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				Response.json({ id: "plan-1", version: 1, url: "https://plans.example/p/demo/plan", changeSummary: null }),
			);

		const source = '---\ntitle: Plan\nkind: plan\n---\n<TLDR id="summary">\nPlan.\n</TLDR>';
		await client.createPlan({ workspaceSlug: "demo", title: "Plan", source, force: true });

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://plans.example/api/plans");
		expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
		expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
		expect(JSON.parse(String(init?.body))).toMatchObject({ source });
	});

	it("reads the current access token for every request", async () => {
		const tokens = ["access-1", "access-2"];
		const freshClient = new PlantifilesClient({
			baseUrl: "https://plans.example",
			getAccessToken: () => tokens.shift() ?? "missing",
		});
		const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({}));

		await freshClient.getPlan("one");
		await freshClient.getPlan("two");

		expect(fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("authorization"))).toEqual([
			"Bearer access-1",
			"Bearer access-2",
		]);
	});

	it("preserves structured and plain-text API failures", async () => {
		vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(Response.json({ message: "No access", code: "forbidden" }, { status: 403 }))
			.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));

		await expect(client.getPlan("plan-1")).rejects.toMatchObject({
			name: "ApiError",
			message: "No access",
			status: 403,
			body: { message: "No access", code: "forbidden" },
		} satisfies Partial<ApiError>);
		await expect(client.getPlan("plan-1")).rejects.toMatchObject({
			message: "Unavailable",
			status: 503,
			body: "Unavailable",
		});
	});

	it("resolves configured plan URLs and rejects foreign services", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(Response.json([{ id: "plan-1", slug: "target" }]))
			.mockResolvedValueOnce(
				Response.json({
					plan: { id: "plan-1", slug: "target", title: "Target", status: "draft" },
					workspace: { slug: "demo" },
					version: { number: 1, source: "source" },
				}),
			);

		const detail = await client.resolvePlan("https://plans.example/p/demo/target/v/2");
		expect(detail.plan.id).toBe("plan-1");
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://plans.example/api/plans?workspace=demo",
			"https://plans.example/api/plans/plan-1",
		]);
		await expect(client.getPlanMarkdown("https://other.example/p/demo/target")).rejects.toThrow(
			"configured Plantifiles service",
		);
	});

	it("requests Markdown through the same authenticated transport", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("# Plan"));

		await expect(client.getPlanMarkdown("https://plans.example/p/demo/target")).resolves.toBe("# Plan");
		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(new Headers(init?.headers).get("accept")).toBe("text/markdown");
		expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
	});
});
