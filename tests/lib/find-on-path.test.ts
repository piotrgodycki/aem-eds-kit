import { describe, expect, it } from "vitest";
import { findOnPath } from "../../src/lib/agents/detect.js";

const files = (list: string[]) => (f: string) => list.includes(f);

describe("findOnPath (agent detection without `which`)", () => {
	it("finds an npm-installed CLI on Windows through PATHEXT", () => {
		const found = findOnPath(
			"claude",
			{
				platform: "win32",
				path: "C:\\Windows\\System32;C:\\Users\\p\\AppData\\Roaming\\npm",
				pathext: ".COM;.EXE;.BAT;.CMD",
			},
			files(["C:\\Users\\p\\AppData\\Roaming\\npm\\claude.cmd"]),
		);
		expect(found).toBe("C:\\Users\\p\\AppData\\Roaming\\npm\\claude.cmd");
	});

	it("handles quoted PATH entries and uppercase extensions on Windows", () => {
		expect(
			findOnPath(
				"codex",
				{ platform: "win32", path: '"C:\\Program Files\\Codex"', pathext: ".EXE" },
				files(["C:\\Program Files\\Codex\\codex.exe"]),
			),
		).toBe("C:\\Program Files\\Codex\\codex.exe");
	});

	it("finds a plain executable on macOS and Linux", () => {
		expect(
			findOnPath(
				"claude",
				{ platform: "darwin", path: "/usr/bin:/opt/homebrew/bin" },
				files(["/opt/homebrew/bin/claude"]),
			),
		).toBe("/opt/homebrew/bin/claude");
	});

	it("returns nothing when the command isn't installed", () => {
		expect(
			findOnPath("cursor", { platform: "win32", path: "C:\\x", pathext: ".CMD" }, files([])),
		).toBe(undefined);
		expect(findOnPath("cursor", { platform: "linux", path: "/usr/bin" }, files([]))).toBe(
			undefined,
		);
	});
});
