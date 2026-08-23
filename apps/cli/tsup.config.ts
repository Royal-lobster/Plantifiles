import { defineConfig } from "tsup";

/**
 * The CLI ships as a single self-contained bundle: `@plantifiles/core`, `@plantifiles/auth`
 * and `@plantifiles/api-client` stay private to this repository, so their code is inlined
 * here rather than published as separate npm packages.
 *
 * `@napi-rs/keyring` is the one exception. It is a native addon resolved per platform at
 * install time, so it must stay an external runtime dependency; `KeychainCredentialStore`
 * imports it dynamically and degrades to the mode-0600 credential file when it is missing.
 */
export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node22",
	platform: "node",
	outDir: "dist",
	bundle: true,
	external: ["@napi-rs/keyring"],
	clean: true,
	sourcemap: true,
	// `yaml` (via @plantifiles/core) resolves to a CommonJS build under Node's `node` export
	// condition and calls `require()` at runtime. esbuild's ESM output stubs `require` with a
	// throwing shim, so hand it a real one built from this module's URL.
	banner: {
		js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
	},
	splitting: false,
	treeshake: true,
});
