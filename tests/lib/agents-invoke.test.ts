import { describe, expect, it } from "vitest";
import { MAX_ARGV_PROMPT_BYTES, argvPrompt } from "../../src/lib/agents/invoke.js";

describe("argvPrompt", () => {
	it("passes a normal prompt through unchanged", () => {
		expect(argvPrompt("Build the hero block.", "/p/tmp/eds-cli/from-design-1.md")).toBe(
			"Build the hero block.",
		);
	});

	it("points a prompt too large for argv at its saved file", () => {
		const big = "x".repeat(MAX_ARGV_PROMPT_BYTES + 1);
		const out = argvPrompt(big, "/p/tmp/eds-cli/from-design-1.md");
		expect(out).toContain("/p/tmp/eds-cli/from-design-1.md");
		expect(Buffer.byteLength(out)).toBeLessThan(1024);
	});

	it("counts bytes, not characters (multi-byte text)", () => {
		const big = "ż".repeat(MAX_ARGV_PROMPT_BYTES / 2 + 1); // 2 bytes each
		expect(argvPrompt(big, "/f.md")).toContain("/f.md");
	});
});
