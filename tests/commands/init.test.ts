import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// findProjectRoot is mocked to a fresh temp dir per test (set in beforeEach).
const h = vi.hoisted(() => ({ root: "" }));
vi.mock("../../src/lib/project.js", () => ({
	findProjectRoot: () => h.root,
}));

import { initProject } from "../../src/commands/init.js";

describe("initProject - .env + xwalk.json by default", () => {
	beforeEach(async () => {
		h.root = await mkdtemp(path.join(os.tmpdir(), "eds-init-"));
	});

	afterEach(async () => {
		if (h.root && existsSync(h.root)) await rm(h.root, { recursive: true, force: true });
		h.root = "";
		process.exitCode = undefined;
	});

	it("writes .env (gitignored) and xwalk.json by default for a UE project", async () => {
		await initProject({ name: "test-site", authoring: "ue", ci: false, yes: true });

		const envFile = path.join(h.root, ".env");
		expect(existsSync(envFile)).toBe(true);
		const env = await readFile(envFile, "utf-8");
		expect(env).toContain("AEM_OPEN=/");
		expect(env).toContain("AEM_PORT=3007");
		expect(env).toContain("AEM_PAGES_URL=");

		// .env is gitignored.
		const gitignore = await readFile(path.join(h.root, ".gitignore"), "utf-8");
		expect(gitignore.split(/\r?\n/)).toContain(".env");

		// xwalk.json carries the multi-field config.
		const xwalkFile = path.join(h.root, "xwalk.json");
		expect(existsSync(xwalkFile)).toBe(true);
		expect(JSON.parse(await readFile(xwalkFile, "utf-8"))).toEqual({
			public: { xwalk: { "multi-field": { enabled: true } } },
		});
	});

	it("honours --no-env / --no-xwalk", async () => {
		await initProject({
			name: "test-site",
			authoring: "ue",
			ci: false,
			env: false,
			xwalk: false,
			yes: true,
		});

		expect(existsSync(path.join(h.root, ".env"))).toBe(false);
		expect(existsSync(path.join(h.root, "xwalk.json"))).toBe(false);
	});

	it("does not write xwalk.json for a non-UE project, but still writes .env", async () => {
		await initProject({
			name: "test-site",
			authoring: "da",
			mountpoint: "https://content.da.live/acme/test-site/",
			ci: false,
			yes: true,
		});

		expect(existsSync(path.join(h.root, "xwalk.json"))).toBe(false);
		expect(existsSync(path.join(h.root, ".env"))).toBe(true);
	});

	it("never overwrites an existing .env", async () => {
		const envFile = path.join(h.root, ".env");
		const { writeFile } = await import("node:fs/promises");
		await writeFile(envFile, "AEM_PORT=9999\n");

		await initProject({ name: "test-site", authoring: "ue", ci: false, yes: true });

		expect(await readFile(envFile, "utf-8")).toBe("AEM_PORT=9999\n");
	});
});
