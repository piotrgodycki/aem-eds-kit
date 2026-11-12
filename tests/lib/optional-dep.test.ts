import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOptional } from "../../src/lib/optional-dep.js";

describe("loadOptional", () => {
	it("finds a dependency installed in the user's project, not next to the CLI", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "eds-opt-"));
		writeFileSync(path.join(project, "package.json"), "{}");
		const dir = path.join(project, "node_modules", "eds-test-optional");
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "package.json"), '{"name":"eds-test-optional","main":"index.js"}');
		writeFileSync(path.join(dir, "index.js"), "exports.found = true;");
		const mod = await loadOptional<{ found: boolean }>("eds-test-optional", project);
		expect(mod?.found).toBe(true);
	});

	it("returns undefined when nothing has it", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "eds-opt-"));
		expect(await loadOptional("eds-test-not-installed", project)).toBeUndefined();
	});
});
