import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, test } from "vitest";

test("serves the Plantifiles tools over stdio", async () => {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [resolve("dist/index.js")],
		env: {
			PLANTIFILES_TOKEN: "test-token",
			PLANTIFILES_BASE_URL: "http://127.0.0.1:1",
		},
		stderr: "pipe",
	});
	const client = new Client({ name: "plantifiles-test", version: "0.1.0" });

	try {
		await client.connect(transport);
		const { tools } = await client.listTools();

		expect(tools.map(({ name }) => name)).toEqual([
			"create_plan",
			"update_plan",
			"get_plan",
			"list_plans",
			"comment_on_plan",
		]);
	} finally {
		await client.close();
	}
});
