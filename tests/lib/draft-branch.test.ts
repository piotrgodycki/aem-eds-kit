import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureVersion, readDraft, reopenDraft, stageBlock } from "../../src/lib/draft.js";
import {
	acceptOnBranch,
	badBranchName,
	behindBase,
	draftBranch,
	githubRepo,
	previewUrl,
	pushVersion,
	updateFromBase,
} from "../../src/lib/draft-branch.js";

let root = "";
let bare = "";
const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

/** One agent round on hero: what it writes becomes the next draft version. */
async function round(css: string, feedback?: string, branch?: string) {
	const restore = await stageBlock(root, "hero");
	await mkdir(path.join(root, "blocks", "hero"), { recursive: true });
	await writeFile(path.join(root, "blocks", "hero", "hero.css"), css);
	const v = await captureVersion(root, "hero", {
		source: { provider: "web" },
		ok: true,
		...(feedback ? { feedback } : {}),
		...(branch ? { branch } : {}),
	});
	await restore();
	return v;
}

describe("drafts on a branch", () => {
	beforeEach(async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "eds-draft-branch-"));
		root = path.join(tmp, "site");
		bare = path.join(tmp, "origin.git");
		git(tmp, "init", "-q", "--bare", "-b", "main", bare);
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

	it("commits versions of a block that is also in the working tree, and accepts an earlier one", async () => {
		// The block already exists on main and on disk, unlike every draft version:
		// git rm --cached alone refuses such a path ("use -f to force removal").
		await mkdir(path.join(root, "blocks", "hero"), { recursive: true });
		await writeFile(path.join(root, "blocks", "hero", "hero.css"), ".hero { color: green; }\n");
		git(root, "add", ".");
		git(root, "commit", "-q", "-m", "hero");
		await round(".hero { color: red; }\n");
		await pushVersion(root, "hero", 1);
		await round(".hero { color: blue; }\n", "Blue, please");
		await pushVersion(root, "hero", 2);
		const back = await acceptOnBranch(root, "hero", 1);

		expect(git(bare, "rev-parse", "draft/hero")).toBe(back.commit);
		expect(git(bare, "show", "draft/hero:blocks/hero/hero.css")).toContain("red");
		expect(git(root, "status", "--porcelain")).toBe("");
	});

	it("keeps the branch a draft started with, e.g. a ticket's feature branch", async () => {
		await round(".hero { color: red; }\n", undefined, "feature/CURLY-111");
		const first = await pushVersion(root, "hero", 1);
		// A later round can't move it: the branch is the ticket's for good.
		await round(".hero { color: blue; }\n", "Blue", "bug/CURLY-999");
		const second = await pushVersion(root, "hero", 2);
		expect(first).toMatchObject({
			branch: "feature/CURLY-111",
			preview: "https://feature-curly-111--site--acme.aem.page/",
		});
		expect(second.branch).toBe("feature/CURLY-111");
		expect(git(bare, "show", "feature/CURLY-111:blocks/hero/hero.css")).toContain("blue");
		expect(() => git(bare, "rev-parse", "--verify", "--quiet", "draft/hero")).toThrow();
		expect((await readDraft(root, "hero"))?.branch).toBe("feature/CURLY-111");
	});

	it("refuses branch names git doesn't take, and the default branch", () => {
		expect(badBranchName("feature/CURLY-111")).toBeNull();
		expect(badBranchName("bug/CURLY-123")).toBeNull();
		expect(badBranchName("feature/../x")).toMatch(/isn't a branch name/);
		expect(badBranchName("-x")).toMatch(/isn't a branch name/);
		expect(badBranchName("main")).toMatch(/can't be committed on main/);
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

	/** Someone else's commit on main, pushed to origin. */
	async function landOnMain(file: string, text: string) {
		const other = path.join(path.dirname(root), "other");
		git(path.dirname(root), "clone", "-q", bare, other);
		git(other, "config", "user.name", "Other");
		git(other, "config", "user.email", "other@example.com");
		await mkdir(path.dirname(path.join(other, file)), { recursive: true });
		await writeFile(path.join(other, file), text);
		git(other, "add", ".");
		git(other, "commit", "-q", "-m", `change ${file}`);
		git(other, "push", "-q", "origin", "main");
		await rm(other, { recursive: true, force: true });
	}

	it("merges the default branch's newer commits into the draft's branch, and says how far behind it was", async () => {
		git(root, "push", "-q", bare, "main");
		git(root, "fetch", "-q", bare, "+main:refs/remotes/origin/main");
		await round(".hero { color: red; }\n");
		await pushVersion(root, "hero", 1);
		await landOnMain("styles/styles.css", "body { margin: 0; }\n");
		git(root, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
		git(root, "config", `url.${bare}.insteadOf`, "https://github.com/acme/site.git");

		const r = await updateFromBase(root, "hero");
		expect(r.merged).toBe(1);
		expect(await behindBase(root, "hero")).toBe(0);
		expect(git(root, "show", "draft/hero:styles/styles.css")).toBe("body { margin: 0; }");
		expect(git(root, "show", "draft/hero:blocks/hero/hero.css")).toContain("red");
		expect(git(root, "log", "-1", "--format=%s", "draft/hero")).toBe("Merge main into draft/hero");
		expect(git(root, "status", "--porcelain")).toBe("");
		expect((await updateFromBase(root, "hero")).merged).toBe(0);
	});

	it("leaves the branch as it was on a conflict, naming the files", async () => {
		git(root, "push", "-q", bare, "main");
		await round(".hero { color: red; }\n");
		const before = (await pushVersion(root, "hero", 1)).commit;
		await landOnMain("blocks/hero/hero.css", ".hero { color: green; }\n");
		git(root, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
		git(root, "config", `url.${bare}.insteadOf`, "https://github.com/acme/site.git");

		await expect(updateFromBase(root, "hero")).rejects.toThrow(
			/conflicts in: blocks\/hero\/hero.css/,
		);
		expect(git(root, "rev-parse", "draft/hero")).toBe(before);
	});

	it("reopens an accepted draft with its versions and branch", async () => {
		await round(".hero { color: red; }\n");
		await pushVersion(root, "hero", 1);
		await acceptOnBranch(root, "hero", 1);
		const draft = await reopenDraft(root, "hero");
		expect(draft.status).toBe("open");
		expect(draft.accepted).toBeUndefined();
		expect(draft.branch).toBe("draft/hero");
		expect(draft.versions).toHaveLength(1);
	});
});
