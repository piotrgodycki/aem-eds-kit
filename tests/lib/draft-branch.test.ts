import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureVersion, readDraft, stageBlock } from "../../src/lib/draft.js";
import {
	acceptOnBranch,
	draftBranch,
	githubRepo,
	previewUrl,
	pushVersion,
} from "../../src/lib/draft-branch.js";

let root = "";
let bare = "";
const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

/** One agent round on hero: what it writes becomes the next draft version. */
async function round(css: string, feedback?: string) {
	const restore = await stageBlock(root, "hero");
	await mkdir(path.join(root, "blocks", "hero"), { recursive: true });
	await writeFile(path.join(root, "blocks", "hero", "hero.css"), css);
	const v = await captureVersion(root, "hero", {
		source: { provider: "web" },
		ok: true,
		...(feedback ? { feedback } : {}),
	});
	await restore();
	return v;
}

describe("drafts on a branch", () => {
	beforeEach(async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "eds-draft-branch-"));
		root = path.join(tmp, "site");
		bare = path.join(tmp, "origin.git");
		git(tmp, "init", "-q", "--bare", bare);
		await mkdir(root);
		git(root, "init", "-q", "-b", "main");
		git(root, "config", "user.name", "Test");
		git(root, "config", "user.email", "test@example.com");
		await writeFile(path.join(root, ".gitignore"), "tmp/\n");
		await writeFile(path.join(root, "README.md"), "site\n");
		git(root, "add", ".");
		git(root, "commit", "-q", "-m", "init");
		// A GitHub origin whose pushes land in the local bare repository.
		git(root, "remote", "add", "origin", "https://github.com/acme/site.git");
		git(root, "config", `url.${bare}.pushInsteadOf`, "https://github.com/acme/site.git");
	});
	afterEach(async () => {
		await rm(path.dirname(root), { recursive: true, force: true });
	});

	it("names the aem.page preview of a branch on a GitHub remote", () => {
		expect(githubRepo("git@github.com:Acme/My.Site.git")).toEqual({
			owner: "Acme",
			repo: "My.Site",
		});
		expect(githubRepo("https://gitlab.com/a/b")).toBeNull();
		expect(previewUrl({ owner: "Acme", repo: "My.Site" }, draftBranch("hero"))).toBe(
			"https://draft-hero--my-site--acme.aem.page/",
		);
	});

	it("commits each version on draft/<name> and pushes it, leaving the working tree alone", async () => {
		await round(".hero { color: red; }\n");
		const first = await pushVersion(root, "hero", 1);
		expect(first).toMatchObject({
			branch: "draft/hero",
			pushed: true,
			preview: "https://draft-hero--site--acme.aem.page/",
		});
		await round(".hero { color: blue; }\n", "Blue, please");
		const second = await pushVersion(root, "hero", 2);

		expect(git(bare, "rev-parse", "draft/hero")).toBe(second.commit);
		expect(git(bare, "rev-parse", `${second.commit}^`)).toBe(first.commit);
		expect(git(bare, "show", "draft/hero:blocks/hero/hero.css")).toContain("blue");
		expect(git(bare, "show", "draft/hero:README.md")).toBe("site");
		expect(git(bare, "log", "-1", "--format=%s", "draft/hero")).toBe("hero v2: Blue, please");
		// The developer's branch and files are as they were.
		expect(git(root, "branch", "--show-current")).toBe("main");
		expect(git(root, "status", "--porcelain")).toBe("");

		const draft = await readDraft(root, "hero");
		expect(draft?.branch).toBe("draft/hero");
		expect(draft?.versions.map((v) => v.commit)).toEqual([first.commit, second.commit]);
	});

	it("commits without pushing when origin isn't on GitHub", async () => {
		git(root, "remote", "set-url", "origin", bare);
		await round(".hero { color: red; }\n");
		const r = await pushVersion(root, "hero", 1);
		expect(r.pushed).toBe(false);
		expect(r.preview).toBeUndefined();
		expect(git(root, "rev-parse", "draft/hero")).toBe(r.commit);
	});

	it("accepts the tip as it is, and an earlier version as a new commit on top", async () => {
		await round(".hero { color: red; }\n");
		await pushVersion(root, "hero", 1);
		await round(".hero { color: blue; }\n", "Blue");
		const tip = await pushVersion(root, "hero", 2);

		expect((await acceptOnBranch(root, "hero", 2)).commit).toBe(tip.commit);
		const back = await acceptOnBranch(root, "hero", 1);
		expect(back.commit).not.toBe(tip.commit);
		expect(git(bare, "rev-parse", "draft/hero")).toBe(back.commit);
		expect(git(bare, "show", "draft/hero:blocks/hero/hero.css")).toContain("red");
		expect(git(bare, "log", "-1", "--format=%s", "draft/hero")).toBe(
			"hero: back to v1 for the pull request",
		);
	});
});
