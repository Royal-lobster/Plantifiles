import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRepositoryRoot, loadRepositoryState, saveRepositoryState, trackedPath } from "./repository-state.js";

let repository: string;

beforeEach(async () => {
	repository = await mkdtemp(join(tmpdir(), "plantifiles-repository-state-"));
	await mkdir(join(repository, ".git"));
});

afterEach(async () => {
	await rm(repository, { force: true, recursive: true });
});

describe("findRepositoryRoot", () => {
	it("discovers a repository from a deeply nested directory", async () => {
		const nested = join(repository, "packages", "docs", "plans");
		await mkdir(nested, { recursive: true });

		expect(findRepositoryRoot(nested)).toBe(repository);
	});

	it("uses the nearest repository when repositories are nested", async () => {
		const nestedRepository = join(repository, "examples", "standalone");
		const nested = join(nestedRepository, "plans", "drafts");
		await mkdir(join(nestedRepository, ".git"), { recursive: true });
		await mkdir(nested, { recursive: true });

		expect(findRepositoryRoot(nested)).toBe(nestedRepository);
	});
});

describe("repository state", () => {
	it("round-trips tracked plans using repository-relative paths", async () => {
		const file = join(repository, "plans", "launch.mdx");
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, "# Launch\n", "utf8");
		const path = trackedPath(repository, file);
		const state = {
			[path]: {
				planId: "plan-launch",
				url: "https://plantifiles.com/p/acme/launch",
				workspace: "acme",
			},
		};

		expect(path).toBe("plans/launch.mdx");
		await saveRepositoryState(repository, state);
		expect(await loadRepositoryState(repository)).toEqual(state);
	});

	it("returns an empty state when the repository has not tracked a plan", async () => {
		expect(await loadRepositoryState(repository)).toEqual({});
	});

	it("reports a corrupted state file instead of silently losing tracking", async () => {
		await writeFile(join(repository, ".plantifiles.json"), "not json", "utf8");

		await expect(loadRepositoryState(repository)).rejects.toBeInstanceOf(SyntaxError);
	});
});
