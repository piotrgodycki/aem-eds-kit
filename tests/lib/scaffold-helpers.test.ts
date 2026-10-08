import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HELPERS_PATH, resolveHelpers, writeHelpers } from "../../src/lib/scaffold/helpers.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function tmp(): Promise<string> {
	const d = await mkdtemp(path.join(tmpdir(), "eds-help-"));
	dirs.push(d);
	return d;
}

describe("writeHelpers", () => {
	it("writes scripts/utils.js with the expected exports", async () => {
		const root = await tmp();
		const res = await writeHelpers(root);
		expect(res.created).toBe(true);
		expect(res.path).toBe(HELPERS_PATH);

		const js = await readFile(path.join(root, HELPERS_PATH), "utf-8");
		for (const fn of [
			"export function toCamelCase",
			"export function getPagePath",
			"export function getLanguageRootPath",
			"export function getSiteArea",
			"export function getEnvironment",
			"export function getContentTopic",
			"export function isUEEdit",
			"export function isUE",
			"export function getMetadata",
		]) {
			expect(js).toContain(fn);
		}
	});

	it("writes only the selected helpers + their dependencies", async () => {
		const root = await tmp();
		await writeHelpers(root, ["getSiteArea"]);
		const js = await readFile(path.join(root, HELPERS_PATH), "utf-8");
		// getSiteArea pulls in getPagePath -> getLanguageRootPath.
		expect(js).toContain("export function getSiteArea");
		expect(js).toContain("export function getPagePath");
		expect(js).toContain("export function getLanguageRootPath");
		// Unselected helpers are not emitted.
		expect(js).not.toContain("export function getEnvironment");
		expect(js).not.toContain("export function isUE");
	});

	it("resolves dependencies in catalog order", () => {
		const resolved = resolveHelpers(["isUE"]);
		expect(resolved).toContain("isUEEdit");
		expect(resolved).toContain("isUEPreview");
		expect(resolved.indexOf("isUEEdit")).toBeLessThan(resolved.indexOf("isUE"));
	});

	it("does not overwrite an existing file", async () => {
		const root = await tmp();
		await writeHelpers(root);
		const file = path.join(root, HELPERS_PATH);
		await writeFile(file, "// custom\n");
		const res = await writeHelpers(root);
		expect(res.created).toBe(false);
		expect(await readFile(file, "utf-8")).toBe("// custom\n");
	});

	it("is a valid module path", async () => {
		const root = await tmp();
		await writeHelpers(root);
		expect(existsSync(path.join(root, "scripts", "utils.js"))).toBe(true);
	});
});
