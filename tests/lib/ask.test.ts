import { describe, expect, it } from "vitest";
import { buildAskPrompt, splitAction } from "../../src/lib/agents/ask.js";

describe("eds ask: the prompt", () => {
	it("carries the attachments, the conversation so far and the latest message, in that order", () => {
		const prompt = buildAskPrompt({
			message: "Is it ready to merge?",
			history: [
				{ role: "user", text: "What does this PR change?" },
				{ role: "agent", text: "The hero block." },
			],
			attachments: [{ title: "PR #14 Hero block", text: "diff --git a/blocks/hero" }],
		});
		const at = (s: string) => prompt.indexOf(s);
		expect(at("## Attached: PR #14 Hero block")).toBeGreaterThan(0);
		expect(at("Developer: What does this PR change?")).toBeGreaterThan(at("diff --git"));
		expect(at("You: The hero block.")).toBeGreaterThan(at("Developer: What does"));
		expect(at("## Latest message")).toBeGreaterThan(at("You: The hero block."));
		expect(prompt).toContain("you can't change them");
	});
});

describe("eds ask: a proposed action", () => {
	const fence = (json: string) => `Sure.\n\n\`\`\`eds-action\n${json}\n\`\`\``;

	it("takes a block action off the answer", () => {
		expect(
			splitAction(
				fence('{"type":"block","design":"https://www.figma.com/design/x","name":"hero"}'),
			),
		).toEqual({
			text: "Sure.",
			action: { type: "block", design: "https://www.figma.com/design/x", name: "hero" },
		});
	});

	it("takes a refine action, trimming the feedback", () => {
		expect(
			splitAction(fence('{"type":"refine","name":"hero","feedback":" bigger title "}')).action,
		).toEqual({
			type: "refine",
			name: "hero",
			feedback: "bigger title",
		});
	});

	it("proposes nothing for an invalid action, and keeps the text as it was", () => {
		for (const bad of [
			'{"type":"block","design":"javascript:alert(1)","name":"hero"}',
			'{"type":"block","design":"https://x","name":"../etc"}',
			'{"type":"delete","name":"hero"}',
			"not json",
		]) {
			const r = splitAction(fence(bad));
			expect(r.action).toBeUndefined();
			expect(r.text).toContain("eds-action");
		}
	});

	it("is just the text without an action block", () => {
		expect(splitAction("  Looks good.  ")).toEqual({ text: "Looks good." });
	});
});
