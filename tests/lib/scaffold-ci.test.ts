import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CI_WORKFLOW_PATH, writeCiWorkflow } from "../../src/lib/scaffold/ci.js";

const dirs: string[] = [];

async function freshProject(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "eds-ci-"));
	dirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("writeCiWorkflow", () => {
	it("writes the workflow to .github/workflows/eds.yml", async () => {
		const root = await freshProject();
		const res = await writeCiWorkflow(root);

		expect(res.created).toBe(true);
		expect(res.path).toBe(CI_WORKFLOW_PATH);

		const file = path.join(root, CI_WORKFLOW_PATH);
		expect(existsSync(file)).toBe(true);

		const yaml = await readFile(file, "utf-8");
		expect(yaml).toContain("name: EDS checks");
		expect(yaml).toContain("audit security");
		expect(yaml).toContain("audit loading");
		expect(yaml).toContain("doctor");
		// `if:` conditions must not carry a `${{ }}` wrapper (template-safe).
		expect(yaml).not.toContain("${{");
	});

	it("does not overwrite an existing workflow", async () => {
		const root = await freshProject();
		const file = path.join(root, CI_WORKFLOW_PATH);
		await writeCiWorkflow(root);
		await writeFile(file, "name: custom\n");

		const res = await writeCiWorkflow(root);
		expect(res.created).toBe(false);
		expect(await readFile(file, "utf-8")).toBe("name: custom\n");
	});
});
