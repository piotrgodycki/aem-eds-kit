import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blockDefaults, buildUeTemplate } from "../../src/lib/template/ue.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function projectWithHero(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "eds-uetpl-"));
	dirs.push(root);
	await mkdir(path.join(root, "blocks", "hero"), { recursive: true });
	const model = {
		models: [
			{
				id: "hero",
				fields: [
					{ component: "tab", name: "main", label: "Main" },
					{ component: "text", name: "title", valueType: "string" },
					{ component: "select", name: "size", valueType: "string", value: "sm" },
					{ component: "boolean", name: "featured", valueType: "boolean" },
					{ component: "container", name: "items", multi: true, fields: [] },
				],
			},
		],
	};
	await writeFile(path.join(root, "blocks", "hero", "_hero.json"), JSON.stringify(model));
	return root;
}

describe("UE template initial content", () => {
	it("reads block model defaults (tabs skipped, container empty, defaults honoured)", async () => {
		const root = await projectWithHero();
		const def = await blockDefaults(root, "hero");
		expect(def).toEqual({ title: "", size: "sm", featured: false, items: [] });
		expect(def).not.toHaveProperty("main"); // tab skipped
	});

	it("builds ordered components with repeats", async () => {
		const root = await projectWithHero();
		const json = JSON.parse(
			await buildUeTemplate(root, { title: "Home", name: "home", blocks: ["hero", "hero"] }),
		);
		expect(json.title).toBe("Home");
		expect(json.template).toBe("home");
		expect(json.components).toHaveLength(2);
		expect(json.components[0]).toMatchObject({ name: "hero", model: "hero" });
		expect(json.components[0].fields.size).toBe("sm");
	});
});
