import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CliConfig = {
	token: string;
	baseUrl: string;
	/** Recorded at login only when the account has exactly one workspace. */
	defaultWorkspace?: string;
};

export const CONFIG_PATH = join(homedir(), ".config", "plantifiles", "config.json");

async function loadConfig(): Promise<CliConfig | null> {
	try {
		return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as CliConfig;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function saveConfig(config: CliConfig): Promise<void> {
	await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
	const temporaryPath = `${CONFIG_PATH}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	await rename(temporaryPath, CONFIG_PATH);
}

export async function resolveConnection(): Promise<CliConfig> {
	const saved = await loadConfig();
	const token = process.env.PLANTIFILES_TOKEN ?? saved?.token;
	const baseUrl = process.env.PLANTIFILES_BASE_URL ?? saved?.baseUrl;
	if (!token) throw new Error("No token configured. Run `plantifiles login` or set PLANTIFILES_TOKEN.");
	if (!baseUrl) throw new Error("No service URL configured. Run `plantifiles login` or set PLANTIFILES_BASE_URL.");
	const defaultWorkspace = process.env.PLANTIFILES_WORKSPACE ?? saved?.defaultWorkspace;
	return {
		token,
		baseUrl: baseUrl.replace(/\/$/, ""),
		...(defaultWorkspace ? { defaultWorkspace } : {}),
	};
}
