import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";
vi.mock("../../src/lib/project.js", () => ({ findProjectRoot: () => root }));

const { trackBlock } = await import("../../src/commands/track.js");
const { readDraft, versionDir } = await import("../../src/lib/draft.js");

const HERO = "export default function decorate(block) {\n  block.classList.add('hero');\n}\n";

describe("track block as a draft version", () => {
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "eds-track-"));
		await mkdir(path.join(root, "blocks", "hero"), { recursive: true });
		await writeFile(path.join(root, "blocks", "hero", "hero.js"), HERO);
		await writeFile(path.join(root, "blocks", "hero", "hero.css"), ".hero {}\n");
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it("leaves blocks/ alone and adds the tracking as the next version", async () => {
		await trackBlock("hero", {
			draft: true,
			view: "hero_seen",
			layer: ["dataLayer"],
			submit: false,
		});
		const draft = await readDraft(root, "hero");
		expect(draft?.versions.map((v) => v.version)).toEqual([1, 2]);
		expect(draft?.versions[1].feedback).toBe(
			"Analytics: clicks as block_click, views as hero_seen, to dataLayer",
		);
		const v2 = await readFile(path.join(versionDir(root, "hero", 2), "hero.js"), "utf-8");
		expect(v2).toContain("event: 'hero_seen'");
		expect(await readFile(path.join(root, "blocks", "hero", "hero.js"), "utf-8")).toBe(HERO);
	});
});
