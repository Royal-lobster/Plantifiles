import type { Entry as KeyringEntry } from "@napi-rs/keyring";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CredentialStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	/**
	 * Where the credential written by the last `set` actually lives, for the CLI
	 * to report. The keychain store degrades silently to a file, so a caller that
	 * hardcodes "the system keychain" tells the user something untrue.
	 */
	location(): string;
}

export type CredentialStoreOptions = {
	environment: string;
	filePath?: string;
	service?: string;
	warn?: (message: string) => void;
};

export class MemoryCredentialStore implements CredentialStore {
	readonly #values = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.#values.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<void> {
		this.#values.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.#values.delete(key);
	}

	location(): string {
		return "memory";
	}
}

class FileCredentialStore implements CredentialStore {
	#queue: Promise<unknown> = Promise.resolve();

	constructor(private readonly filePath: string) {}

	#enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.#queue.then(operation, operation);
		this.#queue = next.catch(() => undefined);
		return next;
	}

	async #readAll(): Promise<Record<string, string>> {
		try {
			const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
			return Object.fromEntries(
				Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw error;
		}
	}

	async #writeAll(values: Record<string, string>): Promise<void> {
		await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
		const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
		await rename(temporaryPath, this.filePath);
		await chmod(this.filePath, 0o600);
	}

	async get(key: string): Promise<string | null> {
		return this.#enqueue(async () => (await this.#readAll())[key] ?? null);
	}

	async set(key: string, value: string): Promise<void> {
		return this.#enqueue(async () => {
			const values = await this.#readAll();
			values[key] = value;
			await this.#writeAll(values);
		});
	}

	async delete(key: string): Promise<void> {
		return this.#enqueue(async () => {
			const values = await this.#readAll();
			if (!(key in values)) return;
			delete values[key];
			await this.#writeAll(values);
		});
	}

	location(): string {
		return this.filePath;
	}
}

type KeyringModule = { Entry: typeof KeyringEntry };

class KeychainCredentialStore implements CredentialStore {
	#keyring: Promise<KeyringModule | null> | undefined;
	#degraded = false;

	constructor(
		private readonly service: string,
		private readonly environment: string,
		private readonly fallback: CredentialStore,
		private readonly warn: (message: string) => void,
	) {}

	#account(key: string): string {
		return `${this.environment}:${key}`;
	}

	#loadKeyring(): Promise<KeyringModule | null> {
		this.#keyring ??= import("@napi-rs/keyring").catch((error: unknown) => {
			this.warn(`System keychain unavailable; using the mode-0600 credential file. ${message(error)}`);
			return null;
		});
		return this.#keyring;
	}

	async get(key: string): Promise<string | null> {
		try {
			const keyring = await this.#loadKeyring();
			if (!keyring) {
				this.#degraded = true;
				return this.fallback.get(key);
			}
			const stored = new keyring.Entry(this.service, this.#account(key)).getPassword();
			if (stored !== null && stored !== undefined) {
				this.#degraded = false;
				return stored;
			}
			/* No keychain entry: whatever the file holds is the real credential, and
			   `location` must say so rather than name a store that has nothing. */
			const fromFile = await this.fallback.get(key);
			if (fromFile !== null) this.#degraded = true;
			return fromFile;
		} catch (error) {
			this.warn(`System keychain read failed; using the credential file. ${message(error)}`);
			this.#degraded = true;
			return this.fallback.get(key);
		}
	}

	async set(key: string, value: string): Promise<void> {
		try {
			const keyring = await this.#loadKeyring();
			if (!keyring) {
				this.#degraded = true;
				return this.fallback.set(key, value);
			}
			new keyring.Entry(this.service, this.#account(key)).setPassword(value);
			await this.fallback.delete(key);
			this.#degraded = false;
		} catch (error) {
			this.warn(`System keychain write failed; using the credential file. ${message(error)}`);
			this.#degraded = true;
			await this.fallback.set(key, value);
		}
	}

	async delete(key: string): Promise<void> {
		try {
			const keyring = await this.#loadKeyring();
			if (keyring) new keyring.Entry(this.service, this.#account(key)).deletePassword();
		} catch (error) {
			this.warn(`System keychain delete failed. ${message(error)}`);
		}
		await this.fallback.delete(key);
	}

	location(): string {
		return this.#degraded ? this.fallback.location() : "the system keychain";
	}
}

/**
 * Keyring errors arrive as a multi-line `Caused by:` chain that repeats the
 * summary verbatim. A degraded keychain is a warning, not a crash, so it has to
 * read as one line that says each thing once.
 */
function message(error: unknown): string {
	const text = error instanceof Error ? error.message : String(error);
	const [summary] = text.split(/caused by:/i);
	return (summary ?? text).replace(/\s+/g, " ").trim();
}

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
	const fallback = new FileCredentialStore(
		options.filePath ?? join(homedir(), ".config", "plantifiles", "credentials.json"),
	);
	return new KeychainCredentialStore(
		options.service ?? "plantifiles",
		options.environment,
		fallback,
		options.warn ?? console.warn,
	);
}
