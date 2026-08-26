import { describe, expect, it } from "vitest";
import { listPlansInputSchema, listPlansQuerySchema, planPageSchema, publishPlanInputSchema } from "./index.js";

const PLAN_SUMMARY = {
	id: "plan-1",
	slug: "release-plan",
	emoji: "🚀",
	title: "Release plan",
	status: "in_review",
	version: 2,
	agentName: "codex",
	openDecisions: 1,
	approvals: 0,
	readTimeMinutes: 4,
	updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("Plantifiles API contracts", () => {
	it("accepts publish metadata and rejects invalid plan emoji", () => {
		expect(
			publishPlanInputSchema.parse({
				workspaceSlug: "demo",
				title: "Release plan",
				source: "# Release plan",
				emoji: "🚀",
			}),
		).toMatchObject({ workspaceSlug: "demo", emoji: "🚀" });
		expect(
			publishPlanInputSchema.safeParse({
				workspaceSlug: "demo",
				title: "Release plan",
				source: "# Release plan",
				emoji: "rocket",
			}).success,
		).toBe(false);
	});

	it("bounds typed and query-string pagination inputs", () => {
		expect(listPlansInputSchema.parse({ workspaceSlug: "demo", limit: 100 })).toMatchObject({ limit: 100 });
		expect(listPlansInputSchema.safeParse({ workspaceSlug: "demo", limit: 101 }).success).toBe(false);
		expect(listPlansQuerySchema.parse({ workspaceSlug: "demo", limit: "25" })).toMatchObject({ limit: 25 });
	});

	it("validates paginated response timestamps and lifecycle states", () => {
		expect(planPageSchema.parse({ items: [PLAN_SUMMARY], nextCursor: "cursor-2" })).toMatchObject({
			nextCursor: "cursor-2",
		});
		expect(
			planPageSchema.safeParse({
				items: [{ ...PLAN_SUMMARY, updatedAt: "not-a-date" }],
				nextCursor: null,
			}).success,
		).toBe(false);
	});
});
