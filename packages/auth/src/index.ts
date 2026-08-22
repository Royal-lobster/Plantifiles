import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { createCredentialStore } from "./credential-store.js";
import type { CredentialStore } from "./credential-store.js";
import { PlantifilesAuth } from "./oauth.js";

export type { CredentialStore } from "./credential-store.js";
export type { LoginInteraction, OAuthUser, PlantifilesAuthOptions } from "./oauth.js";
export { MemoryCredentialStore } from "./credential-store.js";
export { PlantifilesAuth } from "./oauth.js";

export type PlantifilesConfig = {
	baseUrl: string;
	defaultWorkspace?: string;
};

export type PlantifilesConnection = PlantifilesConfig & {
	getAccessToken(): Promise<string>;
};

export const CONFIG_PATH = join(homedir(), ".config", "plantifiles", "config.json");

export async function loadConfig(path = CONFIG_PATH): Promise<PlantifilesConfig | null> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!parsed || typeof parsed !== "object") throw new Error(`Invalid Plantifiles configuration at ${path}.`);
		const record = parsed as Record<string, unknown>;
		if (typeof record.baseUrl !== "string") throw new Error(`Plantifiles configuration at ${path} has no service URL.`);
		return {
			baseUrl: new URL(record.baseUrl).origin,
			...(typeof record.defaultWorkspace === "string" ? { defaultWorkspace: record.defaultWorkspace } : {}),
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function saveConfig(config: PlantifilesConfig, path = CONFIG_PATH): Promise<void> {
	const normalized: PlantifilesConfig = {
		baseUrl: new URL(config.baseUrl).origin,
		...(config.defaultWorkspace ? { defaultWorkspace: config.defaultWorkspace } : {}),
	};
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
	await rename(temporaryPath, path);
}

export function createAuth(
	baseUrl: string,
	options: { store?: CredentialStore; apiKey?: string; fetch?: typeof fetch; now?: () => number } = {},
): PlantifilesAuth {
	const normalizedBaseUrl = new URL(baseUrl).origin;
	const environment = createHash("sha256").update(normalizedBaseUrl).digest("hex").slice(0, 16);
	const store = options.store ?? createCredentialStore({ environment });
	return new PlantifilesAuth(normalizedBaseUrl, {
		store,
		...(options.apiKey ? { apiKey: options.apiKey } : {}),
		...(options.fetch ? { fetch: options.fetch } : {}),
		...(options.now ? { now: options.now } : {}),
	});
}

export async function resolveConnection(
	options: { env?: NodeJS.ProcessEnv; configPath?: string; store?: CredentialStore } = {},
): Promise<PlantifilesConnection> {
	const environment = options.env ?? process.env;
	const saved = await loadConfig(options.configPath);
	const baseUrl = environment.PLANTIFILES_BASE_URL?.trim() || saved?.baseUrl;
	if (!baseUrl) throw new Error("No service URL configured. Run `plantifiles login` or set PLANTIFILES_BASE_URL.");
	const apiKey = environment.PLANTIFILES_TOKEN?.trim() || undefined;
	const auth = createAuth(baseUrl, {
		...(options.store ? { store: options.store } : {}),
		...(apiKey ? { apiKey } : {}),
	});
	if (!(await auth.getAccessToken())) {
		throw new Error("Not signed in. Run `plantifiles login` or set PLANTIFILES_TOKEN to a Clerk API key.");
	}
	const defaultWorkspace = environment.PLANTIFILES_WORKSPACE?.trim() || saved?.defaultWorkspace;
	return {
		baseUrl: new URL(baseUrl).origin,
		async getAccessToken() {
			const token = await auth.getAccessToken();
			if (!token) throw new Error("Plantifiles login expired. Run `plantifiles login` again.");
			return token;
		},
		...(defaultWorkspace ? { defaultWorkspace } : {}),
	};
}
