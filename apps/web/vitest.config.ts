import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		css: { include: /tailwindcss.*(?:theme|preflight)\.css/ },
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
});
