import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Mermaid's optional diagram parsers are async, so they should not weaken the
// tighter budget for code reachable from a client entry point.
const INITIAL_CLIENT_CHUNK_BUDGET = 550_000;
const ASYNC_CLIENT_CHUNK_BUDGET = 700_000;

function enforceClientChunkBudget(): Plugin {
	return {
		name: "plantifiles-client-chunk-budget",
		apply: "build",
		generateBundle(_options, bundle) {
			if (this.environment.name !== "client") return;

			const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
			const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
			const initialChunks = new Set<string>();
			const markInitial = (chunk: (typeof chunks)[number]): void => {
				if (initialChunks.has(chunk.fileName)) return;
				initialChunks.add(chunk.fileName);
				for (const importedFileName of chunk.imports) {
					const importedChunk = chunksByFileName.get(importedFileName);
					if (importedChunk) markInitial(importedChunk);
				}
			};
			for (const chunk of chunks) {
				if (chunk.isEntry) markInitial(chunk);
			}

			const oversized = chunks.flatMap((chunk) => {
				const isInitial = initialChunks.has(chunk.fileName);
				const budget = isInitial ? INITIAL_CLIENT_CHUNK_BUDGET : ASYNC_CLIENT_CHUNK_BUDGET;
				const bytes = Buffer.byteLength(chunk.code);
				return bytes > budget ? [{ fileName: chunk.fileName, bytes, budget, isInitial }] : [];
			});
			if (oversized.length === 0) return;

			const details = oversized
				.sort((left, right) => right.bytes - left.bytes)
				.map(
					({ fileName, bytes, budget, isInitial }) =>
						`- ${fileName}: ${(bytes / 1_000).toFixed(1)} kB (${isInitial ? "initial" : "async"} budget: ${budget / 1_000} kB)`,
				)
				.join("\n");
			this.error(`Client JavaScript chunk budget exceeded:\n${details}`);
		},
	};
}

export default defineConfig({
	resolve: { tsconfigPaths: true },
	build: { chunkSizeWarningLimit: ASYNC_CLIENT_CHUNK_BUDGET / 1_000 },
	// Dev only, and both lines exist for `tailscale serve`: it forwards the
	// tailnet hostname in Host, which Vite rejects by default, and it cannot
	// proxy to an IPv6 literal (it stores `http://::1:3000` and 500s), so the
	// dev server binds IPv4 loopback rather than Node's default `::1`.
	server: { host: "127.0.0.1", allowedHosts: [".ts.net", "localhost.localdomain"] },
	plugins: [
		enforceClientChunkBudget(),
		tailwindcss(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tanstackStart(),
		viteReact(),
	],
});
