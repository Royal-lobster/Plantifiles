import tailwindTheme from "tailwindcss/theme.css?raw";
import { describe, expect, it } from "vitest";
import { compilePrototypeDocuments } from "./prototype-document.server";

describe("prototype document compiler", () => {
	it("compiles plan-authored Tailwind classes into an isolated document", async () => {
		expect(tailwindTheme).toContain("--color-indigo-950");
		const [document] = await compilePrototypeDocuments([
			{
				source:
					'<main class="min-h-screen bg-indigo-950 p-8 text-white md:grid"><h1 class="text-3xl font-bold">Checkout</h1></main>',
				title: "Checkout & confirmation",
			},
		]);
		if (!document) throw new Error("Prototype document missing.");

		expect(document).toContain(".bg-indigo-950");
		expect(document).toContain(".p-8");
		expect(document).toContain("@media");
		expect(document).toContain("Content-Security-Policy");
		expect(document).toContain("script-src 'none'");
		expect(document).toContain("<title>Checkout &amp; confirmation</title>");
		expect(document).toContain('<main class="min-h-screen bg-indigo-950 p-8 text-white md:grid">');
	});

	it("compiles all prototype documents through one shared Tailwind stylesheet", async () => {
		const documents = await compilePrototypeDocuments([
			{ source: '<main class="bg-amber-500">First</main>', title: "First" },
			{ source: '<main class="grid-cols-3">Second</main>', title: "Second" },
		]);

		expect(documents).toHaveLength(2);
		for (const document of documents) {
			expect(document).toContain(".bg-amber-500");
			expect(document).toContain(".grid-cols-3");
		}
	});

	it("removes executable markup and unsafe navigation before rendering", async () => {
		const [document] = await compilePrototypeDocuments([
			{
				source:
					'<div onclick="steal()"><script>alert(1)</script><a href="javascript:steal()">Bad</a><a href="HTTPS://example.com">External</a><a href="#done">Next</a><img src="HTTPS://images.example/preview.png" onerror="steal()"></div>',
				title: "Safe preview",
			},
		]);
		if (!document) throw new Error("Prototype document missing.");

		expect(document).not.toContain("steal()");
		expect(document).not.toContain("<script");
		expect(document).not.toContain("javascript:");
		expect(document).toContain("<a>External</a>");
		expect(document).toContain('<a href="#done">Next</a>');
		expect(document).toContain('<img src="HTTPS://images.example/preview.png">');
	});
});
