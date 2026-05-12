import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/bin/eds.ts"],
	format: ["esm"],
	target: "node20",
	outDir: "dist/bin",
	splitting: false,
	sourcemap: true,
	clean: true,
	shims: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
});
