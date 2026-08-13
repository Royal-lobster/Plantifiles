import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

type TrackedPlan = {
	planId: string;
	url: string;
	workspace: string;
};

export type RepositoryState = Record<string, TrackedPlan>;

export function findRepositoryRoot(start: string): string {
	let current = resolve(start);
	while (true) {
		if (existsSync(resolve(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return resolve(start);
		current = parent;
	}
}

export function trackedPath(root: string, file: string): string {
	return relative(root, resolve(file)).split("\\").join("/");
}

export async function loadRepositoryState(root: string): Promise<RepositoryState> {
	try {
		return JSON.parse(await readFile(resolve(root, ".plantifiles.json"), "utf8")) as RepositoryState;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

export async function saveRepositoryState(root: string, state: RepositoryState): Promise<void> {
	const destination = resolve(root, ".plantifiles.json");
	const temporary = `${destination}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	await rename(temporary, destination);
}
