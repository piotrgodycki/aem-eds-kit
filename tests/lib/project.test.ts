import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProject, findProjectRoot } from "../../src/lib/project.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

const tmpDirs: string[] = [];
afterEach(async () => {
	await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function projectWith(marker: string): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "eds-root-"));
	tmpDirs.push(dir);
	const file = path.join(dir, marker);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, "x");
	return dir;
}

describe("findProjectRoot", () => {
	it("finds root when starting from project dir", () => {
		const root = findProjectRoot(FIXTURE_ROOT);
		expect(root).toBe(FIXTURE_ROOT);
	});

	it("finds root when starting from a subdirectory", () => {
		const root = findProjectRoot(path.join(FIXTURE_ROOT, "blocks", "hero"));
		expect(root).toBe(FIXTURE_ROOT);
	});

	it("returns undefined when no project markers are found", () => {
		const root = findProjectRoot("/tmp");
		expect(root).toBeUndefined();
	});

	it("detects a project without fstab.yaml (UE/DA markers)", async () => {
		for (const marker of ["head.html", "component-definition.json", "scripts/scripts.js"]) {
			const dir = await projectWith(marker);
			expect(findProjectRoot(dir)).toBe(dir);
		}
	});
});

describe("detectProject", () => {
	it("detects project features correctly", () => {
		const project = detectProject(FIXTURE_ROOT);
		expect(project.root).toBe(FIXTURE_ROOT);
		expect(project.hasFstab).toBe(true);
		expect(project.hasBlocks).toBe(true);
		expect(project.hasHeadHtml).toBe(true);
	});
});
