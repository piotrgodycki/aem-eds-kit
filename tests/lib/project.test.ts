import { describe, it, expect } from "vitest";
import path from "node:path";
import { findProjectRoot, detectProject } from "../../src/lib/project.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

describe("findProjectRoot", () => {
	it("finds root when starting from project dir", () => {
		const root = findProjectRoot(FIXTURE_ROOT);
		expect(root).toBe(FIXTURE_ROOT);
	});

	it("finds root when starting from a subdirectory", () => {
		const root = findProjectRoot(path.join(FIXTURE_ROOT, "blocks", "hero"));
		expect(root).toBe(FIXTURE_ROOT);
	});

	it("returns undefined when no fstab.yaml found", () => {
		const root = findProjectRoot("/tmp");
		expect(root).toBeUndefined();
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
