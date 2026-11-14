import { describe, expect, it } from "vitest";
import { buildSamplePrompt, sampleFrom } from "../../src/lib/agents/sample.js";

describe("sample content the agent writes", () => {
	it("asks for the bare fragment of the block, from its code", () => {
		const p = buildSamplePrompt("hero", "tmp/eds-cli/drafts/hero/v3");
		expect(p).toContain("tmp/eds-cli/drafts/hero/v3/");
		expect(p).toContain('<div class="hero">');
		expect(p).toMatch(/HTML only/);
	});

	it("takes the fragment from a reply, fenced or not, and only the block's", () => {
		const html = '<div class="hero"><div><div><h1>Hi</h1></div></div></div>';
		expect(sampleFrom(html, "hero")).toBe(html);
		expect(sampleFrom(`\`\`\`html\n${html}\n\`\`\``, "hero")).toBe(html);
		expect(sampleFrom('<div class="cards"></div>', "hero")).toBeNull();
		expect(sampleFrom("I can't read the files.", "hero")).toBeNull();
	});
});
