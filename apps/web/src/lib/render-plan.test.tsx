import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compilePlan } from "./plan-render.server";
import { renderPlan } from "./render-plan";

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
		const html = renderToStaticMarkup(renderPlan(await compilePlan(BLOCKS)));
		expect(html).toContain("A concise summary.");
		expect(html).toContain("Decision");
		expect(html).toContain("Recommended");
		expect(html).toContain("Rejected: A shortcut");
		expect(html).toContain("Risk ·");
		expect(html).toContain("View source");
		expect(html).toContain("src/example.ts");
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
