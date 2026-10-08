import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelAdd } from "../../src/commands/model.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

vi.mock("../../src/lib/project.js", () => ({
	findProjectRoot: () => FIXTURE_ROOT,
}));

const BLOCK = "model-add-test";
const blockDir = path.join(FIXTURE_ROOT, "blocks", BLOCK);
const modelFile = path.join(blockDir, `_${BLOCK}.json`);

const baseModel = {
	definitions: [{ title: "X", id: BLOCK }],
	models: [{ id: BLOCK, fields: [{ component: "text", name: "title", label: "Title" }] }],
	filters: [],
};

describe("modelAdd", () => {
	beforeEach(async () => {
		await mkdir(blockDir, { recursive: true });
		await writeFile(modelFile, `${JSON.stringify(baseModel, null, 2)}\n`);
	});
	afterEach(async () => {
		await rm(blockDir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it("adds partial fields and dedupes by name", async () => {
		await modelAdd(BLOCK, ["image", "cta"], { yes: true });
		const model = JSON.parse(await readFile(modelFile, "utf-8"));
		const names = model.models[0].fields.map((fld: { name: string }) => fld.name);
		expect(names).toContain("image");
		expect(names).toContain("imageAlt");
		expect(names).toContain("ctaStyle");
		// The pre-existing `title` isn't duplicated.
		expect(names.filter((x: string) => x === "title")).toHaveLength(1);
	});

	it("is idempotent across runs", async () => {
		await modelAdd(BLOCK, ["image"], { yes: true });
		const first = JSON.parse(await readFile(modelFile, "utf-8")).models[0].fields.length;
		await modelAdd(BLOCK, ["image"], { yes: true });
		const second = JSON.parse(await readFile(modelFile, "utf-8")).models[0].fields.length;
		expect(second).toBe(first);
	});

	it("errors on a missing model", async () => {
		await modelAdd("does-not-exist", ["image"], { yes: true });
		expect(process.exitCode).toBe(1);
		expect(existsSync(path.join(FIXTURE_ROOT, "blocks", "does-not-exist"))).toBe(false);
	});
});
