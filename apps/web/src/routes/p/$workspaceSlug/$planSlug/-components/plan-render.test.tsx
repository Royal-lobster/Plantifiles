import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compilePlan } from "../-data/compile-plan.server";
import { type ReaderComment, PlanRenderProvider, planCommentIndex } from "./plan-render-context";
import { renderPlan } from "./plan-render";

const BLOCKS = `<TLDR>
A concise summary.
</TLDR>

<Decision owner="@owner" id="decision-one">
Should this ship?
</Decision>

<Tradeoff>
<Option name="Fast" recommended>
Ships today.
</Option>
<Option name="Safe">
Ships after verification.
</Option>
</Tradeoff>

<Rejected what="A shortcut">
It breaks the invariant.
</Rejected>

<Phase n="1" title="Build">
- [ ] Implement the reader
</Phase>

<Risk severity="high">
Rendering untrusted input could fail loudly.
</Risk>

<Diagram lang="mermaid">
\`\`\`mermaid
graph LR
A --> B
\`\`\`
</Diagram>

<CodeSketch lang="typescript" file="src/example.ts">
\`\`\`typescript
export const answer = 42;
\`\`\`
</CodeSketch>

<Callout kind="note">
This is a note.
</Callout>`;

describe("runtime plan renderer", () => {
	it("renders the complete plan component vocabulary without code generation", async () => {
		const html = renderToStaticMarkup(
			<PlanRenderProvider
				blocks={[]}
				decisions={[]}
				comments={[]}
				selectedVersionNumber={1}
				viewerId={null}
				isCurrentVersion
				versionNumberById={{}}
				workspaceSlug="demo"
				planSlug="example"
			>
				{renderPlan(await compilePlan(BLOCKS))}
			</PlanRenderProvider>,
		);
		expect(html).toContain("A concise summary.");
		expect(html).toContain("Decision");
		expect(html).toContain("Recommended");
		expect(html).toContain("Rejected");
		expect(html).toContain("A shortcut");
		expect(html).toContain("Risk");
		expect(html).toContain("high");
		expect(html).toContain("Enlarge diagram");
		expect(html).toContain("View source");
		expect(html).toContain("src/example.ts");
		expect(html).toContain('data-block-kind="Phase"');
	});

	it("throws for an unknown capitalized component", async () => {
		const tree = await compilePlan("<Unknown>\nNo.\n</Unknown>");
		expect(() => renderToStaticMarkup(renderPlan(tree))).toThrow("Unknown MDX component <Unknown>");
	});

	it("throws for an unknown lowercase element", async () => {
		const tree = await compilePlan("<blink>\nNo.\n</blink>");
		expect(() => renderToStaticMarkup(renderPlan(tree))).toThrow("Unknown MDX element <blink>");
	});
});

describe("plan reader comment visibility", () => {
	const author = { id: "user-1", name: "Reviewer", image: null };
	const comments = [
		{
			id: "v1-keep-root",
			versionId: "version-1",
			blockKey: "survives",
			parentId: null,
			body: "Earlier root",
			agentAssisted: false,
			resolvedAt: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			author,
		},
		{
			id: "v1-reply",
			versionId: "version-1",
			blockKey: null,
			parentId: "v1-keep-root",
			body: "Earlier reply",
			agentAssisted: false,
			resolvedAt: null,
			createdAt: "2026-01-02T00:00:00.000Z",
			author,
		},
		{
			id: "v1-removed-root",
			versionId: "version-1",
			blockKey: "removed",
			parentId: null,
			body: "Removed anchor",
			agentAssisted: false,
			resolvedAt: null,
			createdAt: "2026-01-03T00:00:00.000Z",
			author,
		},
		{
			id: "v2-keep-root",
			versionId: "version-2",
			blockKey: "survives",
			parentId: null,
			body: "Later root",
			agentAssisted: false,
			resolvedAt: null,
			createdAt: "2026-01-04T00:00:00.000Z",
			author,
		},
		{
			id: "v2-reply",
			versionId: "version-2",
			blockKey: null,
			parentId: "v1-keep-root",
			body: "Later reply",
			agentAssisted: false,
			resolvedAt: null,
			createdAt: "2026-01-05T00:00:00.000Z",
			author,
		},
	] satisfies ReaderComment[];
	const versionNumberById = { "version-1": 1, "version-2": 2 };

	it("indexes only comments visible on the selected version", () => {
		const versionOne = planCommentIndex(comments, 1, { survives: true, removed: true }, versionNumberById);
		expect(versionOne.visibleComments.map((comment) => comment.id)).toEqual([
			"v1-keep-root",
			"v1-reply",
			"v1-removed-root",
		]);
		expect(versionOne.rootsByBlockKey.get("survives")?.map((comment) => comment.id)).toEqual(["v1-keep-root"]);
		expect(versionOne.repliesByParentId.get("v1-keep-root")?.map((comment) => comment.id)).toEqual(["v1-reply"]);

		const versionTwo = planCommentIndex(comments, 2, { survives: true }, versionNumberById);
		expect(versionTwo.rootsByBlockKey.get("survives")?.map((comment) => comment.id)).toEqual([
			"v1-keep-root",
			"v2-keep-root",
		]);
		expect(versionTwo.detachedRoots.map((comment) => comment.id)).toEqual(["v1-removed-root"]);
		expect(versionTwo.repliesByParentId.get("v1-keep-root")?.map((comment) => comment.id)).toEqual([
			"v1-reply",
			"v2-reply",
		]);
	});
});
