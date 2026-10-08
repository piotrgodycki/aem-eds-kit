import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateComponent } from "../../src/commands/migrate.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

vi.mock("../../src/lib/project.js", () => ({
	findProjectRoot: () => FIXTURE_ROOT,
}));

const DIALOG = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="s" xmlns:jcr="j" sling:resourceType="cq/gui/components/authoring/dialog">
  <content sling:resourceType="granite/ui/components/coral/foundation/container"><items>
    <title sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="Title" name="./title"/>
  </items></content>
</jcr:root>`;

describe("migrateComponent", () => {
	const blockName = "mig-test";
	const blockDir = path.join(FIXTURE_ROOT, "blocks", blockName);
	let componentDir: string;

	beforeEach(async () => {
		componentDir = await mkdtemp(path.join(tmpdir(), "eds-mig-"));
		await mkdir(path.join(componentDir, "_cq_dialog"), { recursive: true });
		await writeFile(path.join(componentDir, ".content.xml"), '<jcr:root xmlns:jcr="j" jcr:title="Hero"/>');
		await writeFile(path.join(componentDir, "_cq_dialog", ".content.xml"), DIALOG);
	});

	afterEach(async () => {
		await rm(blockDir, { recursive: true, force: true });
		await rm(componentDir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it("generates a block + UE model from a component dialog", async () => {
		await migrateComponent(componentDir, { yes: true, name: blockName });

		expect(existsSync(path.join(blockDir, `${blockName}.js`))).toBe(true);
		expect(existsSync(path.join(blockDir, `${blockName}.css`))).toBe(true);

		const model = JSON.parse(await readFile(path.join(blockDir, `_${blockName}.json`), "utf-8"));
		expect(model.definitions[0].title).toBe("Hero");
		expect(model.models[0].fields[0]).toMatchObject({ component: "text", name: "title" });
	});

	it("errors when the folder has no dialog", async () => {
		const empty = await mkdtemp(path.join(tmpdir(), "eds-mig-empty-"));
		await migrateComponent(empty, { yes: true, name: blockName });
		expect(process.exitCode).toBe(1);
		await rm(empty, { recursive: true, force: true });
	});
});
