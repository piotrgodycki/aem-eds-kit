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

	it("names the blocks and drafts, the only ones a change may name", () => {
		expect(buildAskPrompt({ message: "hi" }, ["cards", "hero"])).toContain(
			"Blocks and drafts you may propose to change: cards, hero. A change needs no design.",
		);
		expect(buildAskPrompt({ message: "hi" })).toContain(
			'There are no blocks or drafts yet, so never propose "refine".',
		);
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

	it("drops a change to a name that is neither a block nor an open draft", () => {
		const reply = fence('{"type":"refine","name":"hero","feedback":"bigger"}');
		expect(splitAction(reply, ["cards"]).action).toBeUndefined();
		expect(splitAction(reply, ["hero"]).action).toMatchObject({ type: "refine", name: "hero" });
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

describe("eds ask: a yes in words", () => {
	const pending = { type: "refine" as const, name: "hero", feedback: "Bigger headline" };
	const accept = 'Doing it.\n\n```eds-action\n{"type":"accept"}\n```';

	it("tells the agent what waits for a yes, and how to say the message accepts it", () => {
		const prompt = buildAskPrompt({ message: "tak", pending });
		expect(prompt).toContain(`waits for the developer's yes: ${JSON.stringify(pending)}`);
		expect(prompt).toContain('{"type":"accept"}');
		expect(buildAskPrompt({ message: "tak" })).not.toContain('{"type":"accept"}');
	});

	it("reports the yes only for a pending action, and never as a new action", () => {
		expect(splitAction(accept, ["hero"], pending)).toEqual({ text: "Doing it.", accepts: true });
		expect(splitAction(accept, ["hero"])).toEqual({ text: "Doing it." });
	});
});
