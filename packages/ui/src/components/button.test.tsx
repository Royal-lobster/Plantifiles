import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
	it("defaults native buttons to a non-submitting type", () => {
		expect(renderToStaticMarkup(<Button>Open</Button>)).toContain('type="button"');
		expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain('type="submit"');
	});

	it("does not pass button-only semantics to a slotted child", () => {
		const html = renderToStaticMarkup(
			<Button asChild>
				<a href="/plans">Plans</a>
			</Button>,
		);
		expect(html).toContain('href="/plans"');
		expect(html).not.toContain("type=");
	});
});
