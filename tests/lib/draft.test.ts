import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	acceptDraft,
	acceptMessage,
	captureVersion,
	discardDraft,
	draftFromBlock,
	listDrafts,
	readDraft,
	stageBlock,
	versionDir,
} from "../../src/lib/draft.js";

const h = vi.hoisted(() => ({ root: "" }));
vi.mock("../../src/lib/project.js", () => ({ findProjectRoot: () => h.root }));

const source = { provider: "web" as const, designRef: "https://example.com/" };
const block = (root: string) => path.join(root, "blocks", "hero");

/** Pretend to be the agent: write the block's files. */
async function agentWrites(root: string, css: string) {
	await mkdir(block(root), { recursive: true });
	await writeFile(path.join(block(root), "hero.js"), "export default function decorate() {}\n");
	await writeFile(path.join(block(root), "hero.css"), css);
}

describe("drafts", () => {
	beforeEach(async () => {
		h.root = await mkdtemp(path.join(os.tmpdir(), "eds-draft-"));
	});
	afterEach(async () => {
		await rm(h.root, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it("starts a draft from a block in blocks/, keeping the design it came from", async () => {
		await agentWrites(h.root, ".hero { color: red; }\n");
		await writeFile(
			path.join(block(h.root), ".eds-meta.json"),
			JSON.stringify({ provider: "figma", designRef: "https://figma.com/x", figmaFileKey: "K" }),
		);
		const draft = await draftFromBlock(h.root, "hero");

		expect(draft.source).toMatchObject({
			provider: "figma",
			designRef: "https://figma.com/x",
			figma: { fileKey: "K" },
			fromBlock: true,
		});
		expect(draft.versions.map((v) => v.version)).toEqual([1]);
		expect(await readFile(path.join(versionDir(h.root, "hero", 1), "hero.css"), "utf-8")).toContain(
			"red",
		);
		expect(acceptMessage(draft, 1)).toBe(
			"feat(blocks): update hero\n\nAccepted draft v1 after one version.\n",
		);
	});

	it("a draft round leaves an existing block untouched and stores the result as v1", async () => {
		await agentWrites(h.root, ".hero { color: red; }\n");
		const restore = await stageBlock(h.root, "hero");
		expect(existsSync(block(h.root))).toBe(false); // set aside for the agent
		await agentWrites(h.root, ".hero { color: blue; }\n");
		const v = await captureVersion(h.root, "hero", { source, ok: true });
		await restore();

		expect(v).toBe(1);
		expect(await readFile(path.join(block(h.root), "hero.css"), "utf-8")).toContain("red");
		expect(await readFile(path.join(versionDir(h.root, "hero", 1), "hero.css"), "utf-8")).toContain(
			"blue",
		);
		const draft = await readDraft(h.root, "hero");
		expect(draft?.status).toBe("open");
		expect(draft?.versions[0]).toMatchObject({
			version: 1,
			ok: true,
			files: ["hero.css", "hero.js"],
		});
	});

	it("a refine round starts from the chosen version and records the feedback", async () => {
		let restore = await stageBlock(h.root, "hero");
		await agentWrites(h.root, ".hero { color: blue; }\n");
		await captureVersion(h.root, "hero", { source, ok: true });
		await restore();
		expect(existsSync(block(h.root))).toBe(false); // there was no block before

		restore = await stageBlock(h.root, "hero", 1);
		expect(await readFile(path.join(block(h.root), "hero.css"), "utf-8")).toContain("blue"); // v1 staged
		await writeFile(path.join(block(h.root), "hero.css"), ".hero { color: green; }\n");
		const v = await captureVersion(h.root, "hero", { source, ok: true, feedback: "make it green" });
		await restore();

		expect(v).toBe(2);
		expect(existsSync(block(h.root))).toBe(false);
		const draft = await readDraft(h.root, "hero");
		expect(draft?.versions.map((x) => x.feedback)).toEqual([undefined, "make it green"]);
		if (!draft) throw new Error("draft missing");
		expect(acceptMessage(draft, 2)).toBe(
			"feat(blocks): hero from https://example.com/\n\nAccepted draft v2 after 2 versions.\n",
		);
	});

	it("accept copies the chosen version into blocks/, discard removes the draft only", async () => {
		const restore = await stageBlock(h.root, "hero");
		await agentWrites(h.root, ".hero { color: blue; }\n");
		await captureVersion(h.root, "hero", { source, ok: true });
		await restore();

		const { version } = await acceptDraft(h.root, "hero");
		expect(version).toBe(1);
		expect(await readFile(path.join(block(h.root), "hero.css"), "utf-8")).toContain("blue");
		expect((await readDraft(h.root, "hero"))?.status).toBe("accepted");
		await expect(acceptDraft(h.root, "hero", 7)).rejects.toThrow(/no version 7/);

		expect((await listDrafts(h.root)).map((d) => d.name)).toEqual(["hero"]);
		expect(await discardDraft(h.root, "hero")).toBe(true);
		expect(await listDrafts(h.root)).toEqual([]);
		expect(existsSync(block(h.root))).toBe(true); // the accepted block stays
	});

	it("eds draft accept --branch commits blocks/<name>/ with the review rounds", async () => {
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: h.root, encoding: "utf-8" }).trim();
		git("init", "--quiet", "-b", "main");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		await writeFile(path.join(h.root, "README.md"), "site\n");
		git("add", "-A");
		git("commit", "--quiet", "-m", "init");

		const restore = await stageBlock(h.root, "hero");
		await agentWrites(h.root, ".hero { color: blue; }\n");
		await captureVersion(h.root, "hero", { source, ok: true });
		await restore();

		const { draftAccept } = await import("../../src/commands/draft.js");
		await draftAccept("hero", { branch: "feature/hero" });

		expect(process.exitCode).toBeUndefined();
		expect(git("branch", "--show-current")).toBe("feature/hero");
		expect(git("log", "-1", "--format=%s")).toBe("feat(blocks): hero from https://example.com/");
		expect(git("show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual([
			"blocks/hero/hero.css",
			"blocks/hero/hero.js",
		]);
		expect((await readDraft(h.root, "hero"))?.accepted?.commit).toBe(
			git("rev-parse", "--short", "HEAD"),
		);
	});
});
