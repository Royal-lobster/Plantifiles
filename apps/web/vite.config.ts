import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	// Dev only, and both lines exist for `tailscale serve`: it forwards the
	// tailnet hostname in Host, which Vite rejects by default, and it cannot
	// proxy to an IPv6 literal (it stores `http://::1:3000` and 500s), so the
	// dev server binds IPv4 loopback rather than Node's default `::1`.
	server: { host: "127.0.0.1", allowedHosts: [".ts.net", "localhost.localdomain"] },
	plugins: [tailwindcss(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
});
