import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { createBlock } from "../../src/commands/block/create.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

// Mock findProjectRoot to return our fixture
vi.mock("../../src/lib/project.js", () => ({
	findProjectRoot: () => FIXTURE_ROOT,
}));

describe("createBlock", () => {
	const testBlockName = "test-block";
	const testBlockDir = path.join(FIXTURE_ROOT, "blocks", testBlockName);

	afterEach(async () => {
		// Cleanup
		if (existsSync(testBlockDir)) {
			await rm(testBlockDir, { recursive: true });
		}
		process.exitCode = undefined;
	});

	it("creates a block with JS and CSS files", async () => {
		await createBlock(testBlockName);

		expect(existsSync(path.join(testBlockDir, `${testBlockName}.js`))).toBe(true);
		expect(existsSync(path.join(testBlockDir, `${testBlockName}.css`))).toBe(true);

		const js = await readFile(path.join(testBlockDir, `${testBlockName}.js`), "utf-8");
		expect(js).toContain("decorate(block)");
	});

	it("creates UE model when --with-ue-model", async () => {
		await createBlock(testBlockName, { withUeModel: true });

		const modelFile = path.join(testBlockDir, `_${testBlockName}.json`);
		expect(existsSync(modelFile)).toBe(true);

		const model = JSON.parse(await readFile(modelFile, "utf-8"));
		expect(model.id).toBe(testBlockName);
	});

	it("rejects invalid block names", async () => {
		await createBlock("InvalidName");
		expect(process.exitCode).toBe(1);
	});

	it("rejects duplicate block names", async () => {
		await createBlock(testBlockName);
		process.exitCode = undefined;
		await createBlock(testBlockName);
		expect(process.exitCode).toBe(1);
	});
});
