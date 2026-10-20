import { describe, expect, it } from "vitest";
import { isEscape, isExit } from "../../src/lib/prompts.js";

const named = (name: string) => Object.assign(new Error(name), { name });

describe("prompt cancellation helpers", () => {
	it("tells Esc (AbortPromptError) from Ctrl+C (ExitPromptError)", () => {
		expect(isEscape(named("AbortPromptError"))).toBe(true);
		expect(isExit(named("ExitPromptError"))).toBe(true);
		expect(isEscape(named("ExitPromptError"))).toBe(false);
		expect(isExit(new Error("boom"))).toBe(false);
		expect(isEscape("AbortPromptError")).toBe(false);
	});
});
