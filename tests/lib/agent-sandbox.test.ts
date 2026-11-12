import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { canSandbox, sandboxed } from "../../src/lib/agents/os-sandbox.js";

const has =
	(...files: string[]) =>
	(f: string) =>
		files.includes(f);

describe("agent sandbox", () => {
	it("is there on macOS and on Linux with bubblewrap, not on Windows", () => {
		expect(canSandbox("darwin", has("/usr/bin/sandbox-exec"))).toBe(true);
		expect(canSandbox("linux", has("/usr/bin/bwrap"))).toBe(true);
		expect(canSandbox("linux", has())).toBe(false);
		expect(canSandbox("win32", () => true)).toBe(false);
		expect(sandboxed("codex", [], { project: "/p", agentDirs: [], platform: "win32" })).toBeNull();
	});

	it("hides home on macOS except the project and the agent's folder", () => {
		const run = sandboxed("codex", ["exec"], {
			project: "/Users/me/site",
			agentDirs: [".codex"],
			home: "/Users/me",
			platform: "darwin",
			exists: () => true,
		});
		expect(run?.file).toBe("/usr/bin/sandbox-exec");
		const profile = run?.args[1] ?? "";
		expect(profile).toContain('(deny file-read* file-write* (subpath "/Users/me")');
		expect(profile).toContain('(subpath "/Users/me/site") (subpath "/Users/me/.codex")');
		expect(run?.args.slice(2)).toEqual(["codex", "exec"]);
	});

	it("replaces home with an empty one on Linux, then binds the project back", () => {
		const run = sandboxed("codex", ["exec"], {
			project: "/home/me/site",
			agentDirs: [".codex"],
			home: "/home/me",
			platform: "linux",
			exists: () => true,
		});
		expect(run?.args).toEqual(
			expect.arrayContaining(["--tmpfs", "/home/me", "--bind", "/home/me/site", "/home/me/site"]),
		);
		expect(run?.args.slice(-3)).toEqual(["--", "codex", "exec"]);
	});

	// The real thing, where this machine has a sandbox: macOS CI, Linux with bwrap.
	const root = mkdtempSync(path.join(tmpdir(), "eds-sandbox-"));
	afterAll(() => rmSync(root, { recursive: true, force: true }));
	it.runIf(canSandbox())("lets the agent read the project and nothing else in home", () => {
		const home = path.join(root, "home");
		const project = path.join(home, "site");
		mkdirSync(project, { recursive: true });
		writeFileSync(path.join(project, "inside.txt"), "inside");
		writeFileSync(path.join(home, "secret.txt"), "secret");
		const cat = (file: string) => {
			const run = sandboxed("/bin/cat", [file], { project, agentDirs: [], home });
			if (!run) throw new Error("no sandbox");
			try {
				return execFileSync(run.file, run.args, { encoding: "utf-8", stdio: "pipe" });
			} catch {
				return "denied";
			}
		};
		expect(cat(path.join(project, "inside.txt"))).toBe("inside");
		expect(cat(path.join(home, "secret.txt"))).toBe("denied");
	});
});
