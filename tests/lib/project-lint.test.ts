import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lintBlock } from "../../src/lib/project-lint.js";

/**
 * A stand-in for the project's stylelint: --fix turns alpha 0.x into a
 * percentage, a plain run fails on `!important`, which --fix can't change.
 */
const FAKE_STYLELINT = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
if (args.includes("--fix")) {
	for (const f of files) fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/, 0\\.(\\d+)\\)/g, ", $1%)"));
	process.exit(0);
}
const bad = files.filter((f) => /!important|, 0\\.\\d+\\)/.test(fs.readFileSync(f, "utf8")));
for (const f of bad) console.log(f + "\\n  1:1  ✖  Unexpected !important  declaration-no-important");
process.exit(bad.length ? 2 : 0);
`;

let root = "";
const dir = () => path.join(root, "blocks", "hero");

describe.skipIf(process.platform === "win32")("the project's own linters on a block", () => {
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "eds-lint-"));
		await mkdir(dir(), { recursive: true });
		await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true });
		const bin = path.join(root, "node_modules", ".bin", "stylelint");
		await writeFile(bin, FAKE_STYLELINT);
		await chmod(bin, 0o755);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("fixes what the linter can fix, and passes", async () => {
		await writeFile(
			path.join(dir(), "hero.css"),
			".hero { color: rgb(0 0 0 / 0.35); background: rgba(0, 0, 0, 0.75); }\n",
		);
		const [r] = await lintBlock(root, dir(), ["hero.css"]);
		expect(r).toMatchObject({ tool: "stylelint", ok: true });
		expect(await readFile(path.join(dir(), "hero.css"), "utf8")).toContain("75%)");
	});

	it("reports what is left after --fix", async () => {
		await writeFile(path.join(dir(), "hero.css"), ".hero { color: red !important; }\n");
		const [r] = await lintBlock(root, dir(), ["hero.css"]);
		expect(r.ok).toBe(false);
		expect(r.output).toMatch(/declaration-no-important/);
	});

	it("skips a project without the linter", async () => {
		await rm(path.join(root, "node_modules"), { recursive: true });
		await writeFile(path.join(dir(), "hero.css"), ".hero {}\n");
		expect(await lintBlock(root, dir(), ["hero.css"])).toEqual([]);
	});
});
