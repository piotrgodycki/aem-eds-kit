import { afterEach, describe, expect, it, vi } from "vitest";

// The real command parser, with the draft commands replaced so nothing runs.
const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>);
vi.mock("../../src/commands/draft.js", () => ({
	draftList: async (...a: unknown[]) => void calls.push(["list", ...a]),
	draftPreview: async (...a: unknown[]) => void calls.push(["preview", ...a]),
	draftRefine: async (...a: unknown[]) => void calls.push(["refine", ...a]),
	draftAccept: async (...a: unknown[]) => void calls.push(["accept", ...a]),
	draftDiscard: async (...a: unknown[]) => void calls.push(["discard", ...a]),
}));

async function eds(...args: string[]) {
	calls.length = 0;
	vi.resetModules();
	const argv = process.argv;
	const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	process.argv = ["node", "eds", ...args];
	try {
		await import("../../src/bin/eds.js");
		await vi.waitFor(() => expect(calls.length).toBe(1));
	} finally {
		process.argv = argv;
		write.mockRestore();
	}
	return calls[0];
}

describe("eds draft arguments", () => {
	afterEach(() => {
		process.exitCode = undefined;
	});

	it("preview and accept take the version as an argument, not --version", async () => {
		expect(await eds("draft", "preview", "hero", "2", "--no-open")).toEqual([
			"preview",
			"hero",
			expect.objectContaining({ version: "2", open: false }),
		]);
		expect(await eds("draft", "accept", "hero", "v1", "--branch", "feature/hero")).toEqual([
			"accept",
			"hero",
			expect.objectContaining({ version: "v1", branch: "feature/hero" }),
		]);
		expect(await eds("draft", "accept", "hero")).toEqual([
			"accept",
			"hero",
			expect.objectContaining({ version: undefined }),
		]);
	});

	it("refine starts from --from, and -- keeps a comment that looks like a flag", async () => {
		expect(await eds("draft", "refine", "--from", "1", "--", "hero", "--bigger headline")).toEqual([
			"refine",
			"hero",
			"--bigger headline",
			expect.objectContaining({ version: "1" }),
		]);
	});

	it("parses Node-style argv when run by Electron as Node (desktop studio)", async () => {
		Object.defineProperty(process.versions, "electron", { value: "38.0.0", configurable: true });
		try {
			expect(await eds("draft", "accept", "hero", "2")).toEqual([
				"accept",
				"hero",
				expect.objectContaining({ version: "2" }),
			]);
		} finally {
			Reflect.deleteProperty(process.versions, "electron");
		}
	});
});
