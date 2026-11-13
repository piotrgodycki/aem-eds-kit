import { describe, expect, it } from "vitest";
import { buildDescribePrompt, splitDescription } from "../../src/lib/agents/describe.js";
import type { Draft } from "../../src/lib/draft.js";

const draft: Draft = {
	name: "hero",
	status: "accepted",
	source: { provider: "figma", designRef: "https://figma.com/x" },
	versions: [
		{ version: 1, createdAt: "", ok: true, files: [] },
		{ version: 2, createdAt: "", ok: true, files: [], feedback: "słabo to wygląda popraw zrób h1" },
		{
			version: 3,
			createdAt: "",
			ok: true,
			files: [],
			feedback: "białe tło, dodaj coś ciekawszego",
		},
	],
};

describe("eds draft describe", () => {
	it("hands the agent the files and the review notes, and asks for English without quoting them", () => {
		const prompt = buildDescribePrompt(draft, 2, "tmp/eds-cli/drafts/hero/v2");
		expect(prompt).toContain("tmp/eds-cli/drafts/hero/v2/");
		expect(prompt).toContain("- v2: słabo to wygląda popraw zrób h1");
		expect(prompt).not.toContain("białe tło"); // after the accepted version
		expect(prompt).toContain("Write in English");
		expect(prompt).toContain("Never quote the reviewers' notes");
		expect(prompt).toContain("built from the design https://figma.com/x");
	});

	it("splits the reply into a title and a body, also from a fenced reply", () => {
		const reply = "feat(blocks): hero with an h1 headline\n\n## Summary\nA hero.";
		expect(splitDescription(reply)).toEqual({
			title: "feat(blocks): hero with an h1 headline",
			body: "## Summary\nA hero.",
		});
		expect(splitDescription(`\`\`\`markdown\n${reply}\n\`\`\``)?.title).toBe(
			"feat(blocks): hero with an h1 headline",
		);
		expect(splitDescription("just one line")).toBeNull();
	});
});
