import { afterEach, describe, expect, it } from "vitest";
import { confinedOnly, confinedToProject } from "../../src/lib/agents/confine.js";

describe("keeping an agent to the project", () => {
	afterEach(() => {
		delete process.env.EDS_CONFINED_ONLY;
	});

	it("trusts Claude Code only when it has --restricted", async () => {
		expect(await confinedToProject("claude", async () => true)).toBe(true);
		expect(await confinedToProject("claude", async () => false)).toBe(false);
	});

	it("keeps local models in, and Cursor and Codex out", async () => {
		const never = async () => false;
		expect(await confinedToProject("ollama", never)).toBe(true);
		expect(await confinedToProject("local", never)).toBe(true);
		expect(await confinedToProject("cursor", never)).toBe(false);
		expect(await confinedToProject("codex", never)).toBe(false);
	});

	it("is opt-in through EDS_CONFINED_ONLY=1", () => {
		expect(confinedOnly()).toBe(false);
		process.env.EDS_CONFINED_ONLY = "1";
		expect(confinedOnly()).toBe(true);
	});
});
