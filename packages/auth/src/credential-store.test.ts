import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCredentialStore } from "./credential-store.js";

async function fileBackedStore(contents: Record<string, string>) {
	const directory = await mkdtemp(join(tmpdir(), "plantifiles-credentials-"));
	const filePath = join(directory, "credentials.json");
	await writeFile(filePath, JSON.stringify(contents), "utf8");
	/* A service name nothing has ever written to guarantees the keychain holds no
	   entry, so the read must come from the file on every platform -- including
	   one with no keychain at all. */
	const store = createCredentialStore({
		environment: "test",
		service: `plantifiles-test-${process.pid}-${Date.now()}`,
		filePath,
		warn: () => {},
	});
	return { store, filePath };
}

describe("createCredentialStore", () => {
	it("reports the file as the location when the credential came from it", async () => {
		const { store, filePath } = await fileBackedStore({ session: "stored-value" });

		expect(await store.get("session")).toBe("stored-value");
		expect(store.location()).toBe(filePath);
	});

	it("does not claim a location it has not read from", async () => {
		const { store, filePath } = await fileBackedStore({});

		expect(await store.get("session")).toBeNull();
		/* Nothing was found anywhere, so the keychain is still the intended target
		   and naming the file would be equally misleading. */
		expect(store.location()).not.toBe(filePath);
	});
});
