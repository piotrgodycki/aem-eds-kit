import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/bin/eds.ts"],
	format: ["esm"],
	target: "node20",
	outDir: "dist/bin",
	splitting: false,
	// No source map in the published CLI - it was ~60% of the package and end
	// users don't need it. Re-enable ad hoc for debugging: `tsup --sourcemap`.
	sourcemap: false,
	// Minify the single bundled binary to roughly halve its size.
	minify: true,
	clean: true,
	shims: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
});
