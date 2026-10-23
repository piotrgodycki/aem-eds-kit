import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cloneBoilerplate, isEmptyDir, resolveBoilerplate } from "../../src/lib/boilerplate.js";

describe("resolveBoilerplate", () => {
	it("defaults to the Document Authoring boilerplate, --ue to crosswalk", () => {
		expect(resolveBoilerplate()).toEqual({
			url: "https://github.com/adobe/aem-boilerplate.git",
			label: "adobe/aem-boilerplate",
			ue: false,
		});
		expect(resolveBoilerplate(undefined, true)).toMatchObject({
			label: "adobe-rnd/aem-boilerplate-xwalk",
			ue: true,
		});
	});

	it("takes aliases, owner/repo and full URLs", () => {
		expect(resolveBoilerplate("xwalk").label).toBe("adobe-rnd/aem-boilerplate-xwalk");
		expect(resolveBoilerplate("DA").label).toBe("adobe/aem-boilerplate");
		expect(resolveBoilerplate("commerce").label).toBe("hlxsites/aem-boilerplate-commerce");
		expect(resolveBoilerplate("my-org/my-boilerplate")).toEqual({
			url: "https://github.com/my-org/my-boilerplate.git",
			label: "my-org/my-boilerplate",
			ue: false,
		});
		expect(resolveBoilerplate("git@github.com:acme/eds-xwalk-starter.git")).toEqual({
			url: "git@github.com:acme/eds-xwalk-starter.git",
			label: "acme/eds-xwalk-starter",
			ue: true,
		});
		expect(resolveBoilerplate("https://gitlab.com/acme/site.git").label).toBe(
			"https://gitlab.com/acme/site.git",
		);
	});
});

describe("cloneBoilerplate", () => {
	let work: string;
	let source: string;
	const env = { ...process.env };
	const git = (args: string[], cwd: string) =>
		execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

	beforeAll(async () => {
		Object.assign(process.env, {
			GIT_AUTHOR_NAME: "Test",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test",
			GIT_COMMITTER_EMAIL: "test@example.com",
		});
		work = await mkdtemp(path.join(os.tmpdir(), "eds-new-"));
		source = path.join(work, "aem-boilerplate");
		await mkdir(path.join(source, "blocks", "hero"), { recursive: true });
		await writeFile(path.join(source, "head.html"), "<script src='/scripts/aem.js'></script>\n");
		await writeFile(
			path.join(source, "blocks", "hero", "hero.js"),
			"export default function () {}\n",
		);
		git(["init", "--quiet"], source);
		git(["add", "-A"], source);
		git(["commit", "--quiet", "-m", "one"], source);
		await writeFile(path.join(source, "README.md"), "# aem-boilerplate\n");
		git(["add", "-A"], source);
		git(["commit", "--quiet", "-m", "two"], source);
	});

	afterAll(async () => {
		process.env = env;
		await rm(work, { recursive: true, force: true });
	});

	const bp = () => ({ url: `file://${source}`, label: "adobe/aem-boilerplate", ue: false });

	it("copies the files into a fresh history with one initial commit", async () => {
		const dir = path.join(work, "fresh");
		const res = await cloneBoilerplate(bp(), dir, { remote: "https://github.com/me/site.git" });
		expect(res.uncommitted).toBe(false);
		expect(res.commit).toBe(git(["rev-parse", "HEAD"], source));
		expect(await readFile(path.join(dir, "blocks", "hero", "hero.js"), "utf-8")).toContain(
			"export",
		);
		expect(git(["log", "--format=%s"], dir)).toBe(
			`Initial commit from adobe/aem-boilerplate@${res.commit.slice(0, 7)}`,
		);
		expect(git(["branch", "--show-current"], dir)).toBe("main");
		expect(git(["remote"], dir)).toBe("origin");
		expect(git(["remote", "get-url", "origin"], dir)).toBe("https://github.com/me/site.git");
	});

	it("--keep-history keeps the commits and names the remote upstream", async () => {
		const dir = path.join(work, "kept");
		await cloneBoilerplate(bp(), dir, { keepHistory: true });
		expect(git(["log", "--format=%s"], dir).split("\n")).toEqual(["two", "one"]);
		expect(git(["remote"], dir)).toBe("upstream");
	});

	it("fails cleanly on a bad source and leaves no folder behind", async () => {
		const dir = path.join(work, "broken");
		await expect(
			cloneBoilerplate({ url: path.join(work, "nope"), label: "nope", ue: false }, dir),
		).rejects.toThrow(/Couldn't clone nope: .*(doesn't exist|does not exist)/);
		expect(existsSync(dir)).toBe(false);
	});

	it("isEmptyDir: missing and empty are fine, a used folder isn't", async () => {
		expect(await isEmptyDir(path.join(work, "missing"))).toBe(true);
		await mkdir(path.join(work, "empty"));
		expect(await isEmptyDir(path.join(work, "empty"))).toBe(true);
		expect(await isEmptyDir(source)).toBe(false);
	});
});
