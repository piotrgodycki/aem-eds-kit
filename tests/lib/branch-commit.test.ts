import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitFilesOnBranch } from "../../src/lib/draft-branch.js";

let root = "";
const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "eds-branch-"));
	git("init", "-q");
	// CI runners have no git identity: the repo gets its own, as a real project's does.
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await mkdir(path.join(root, "scripts"));
	await writeFile(path.join(root, "scripts", "a.js"), "a\n");
	git("add", "-A");
	git("commit", "-qm", "base");
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("commitFilesOnBranch", () => {
	it("commits the named files on a new branch, leaving the current branch and the index alone", async () => {
		await writeFile(path.join(root, "scripts", "a.js"), "a changed\n");
		await writeFile(path.join(root, "scripts", "b.js"), "b\n");
		const before = git("rev-parse", "HEAD");
		const r = await commitFilesOnBranch(root, "feature/EDS-1", ["scripts/b.js"], "Add b");
		expect(r.pushed).toBe(false);
		expect(git("rev-parse", "HEAD")).toBe(before);
		expect(git("show", "feature/EDS-1:scripts/b.js")).toBe("b");
		// a.js wasn't named: the branch has it as the base commit does.
		expect(git("show", "feature/EDS-1:scripts/a.js")).toBe("a");
		expect(await readFile(path.join(root, "scripts", "a.js"), "utf-8")).toBe("a changed\n");
		expect(git("status", "--short")).toContain("scripts/a.js");
	});

	it("adds the next commit on top of the branch", async () => {
		await writeFile(path.join(root, "scripts", "b.js"), "b1\n");
		await commitFilesOnBranch(root, "feature/EDS-1", ["scripts/b.js"], "b1");
		await writeFile(path.join(root, "scripts", "b.js"), "b2\n");
		await commitFilesOnBranch(root, "feature/EDS-1", ["scripts/b.js"], "b2");
		expect(git("log", "--format=%s", "feature/EDS-1")).toBe("b2\nb1\nbase");
	});
});
