import { describe, expect, it } from "vitest";
import { buildIssuePrompt, parseIssue } from "../../src/lib/issue-write.js";

describe("issue writing", () => {
	it("asks for each kind's own sections and passes the block's pages on", () => {
		const bug = buildIssuePrompt({
			kind: "bug",
			title: "Price missing",
			notes: "On mobile",
			block: { name: "hero", pages: 42 },
		});
		expect(bug).toContain("## Steps to reproduce");
		expect(bug).toContain('the block "hero" (blocks/hero/), which is on 42 pages');
		expect(buildIssuePrompt({ kind: "task", title: "t", notes: "" })).toContain("## Done when");
		expect(buildIssuePrompt({ kind: "feature", title: "t", notes: "" })).toContain(
			"## Acceptance criteria",
		);
	});

	it("changes a written issue as asked, keeping the rest", () => {
		const prompt = buildIssuePrompt({
			kind: "task",
			title: "Tidy hero",
			notes: "",
			current: { title: "Tidy the hero", body: "## What to do\nTidy it" },
			change: "Add a step for tablets",
		});
		expect(prompt).toContain("The person asks: Add a step for tablets");
		expect(prompt).toContain("TITLE: Tidy the hero\n\n## What to do\nTidy it");
	});

	it("reads the title line and keeps the rest as the body", () => {
		expect(parseIssue("TITLE: Show the price on mobile\n\n## Goal\nSell more", "x")).toEqual({
			title: "Show the price on mobile",
			body: "## Goal\nSell more",
		});
		expect(parseIssue("## Goal\nNo title line", "Own title")).toEqual({
			title: "Own title",
			body: "## Goal\nNo title line",
		});
	});
});
