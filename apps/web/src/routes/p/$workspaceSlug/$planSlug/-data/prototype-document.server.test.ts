import tailwindTheme from "tailwindcss/theme.css?raw";
import { describe, expect, it } from "vitest";
import { compilePrototypeDocument } from "./prototype-document.server";

describe("prototype document compiler", () => {
	it("compiles plan-authored Tailwind classes into an isolated document", async () => {
		expect(tailwindTheme).toContain("--color-indigo-950");
		const document = await compilePrototypeDocument(
			'<main class="min-h-screen bg-indigo-950 p-8 text-white md:grid"><h1 class="text-3xl font-bold">Checkout</h1></main>',
			"Checkout & confirmation",
		);

		expect(document).toContain(".bg-indigo-950");
		expect(document).toContain(".p-8");
		expect(document).toContain("@media");
		expect(document).toContain("Content-Security-Policy");
		expect(document).toContain("script-src 'none'");
		expect(document).toContain("<title>Checkout &amp; confirmation</title>");
		expect(document).toContain('<main class="min-h-screen bg-indigo-950 p-8 text-white md:grid">');
	});

	it("removes executable markup and unsafe navigation before rendering", async () => {
		const document = await compilePrototypeDocument(
			'<div onclick="steal()"><script>alert(1)</script><a href="javascript:steal()">Bad</a><a href="HTTPS://example.com">External</a><a href="#done">Next</a><img src="HTTPS://images.example/preview.png" onerror="steal()"></div>',
			"Safe preview",
		);

		expect(document).not.toContain("steal()");
		expect(document).not.toContain("<script");
		expect(document).not.toContain("javascript:");
		expect(document).toContain("<a>External</a>");
		expect(document).toContain('<a href="#done">Next</a>');
		expect(document).toContain('<img src="HTTPS://images.example/preview.png">');
	});
});
