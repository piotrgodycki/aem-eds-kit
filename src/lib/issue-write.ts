/**
 * `eds issue write`: an agent turns a few notes into an issue a team can act on.
 * It only writes the text. The caller shows it, the person edits and accepts it,
 * and only then does anything open it in GitHub, Jira or Azure DevOps.
 */

export interface IssueNotes {
	kind: "feature" | "bug" | "task";
	/** The person's own title, which the agent may sharpen. */
	title: string;
	notes: string;
	/** The block it is about, and the pages it is on when known. */
	block?: { name: string; pages: number | null };
}

const SECTIONS = {
	feature: ["## Goal", "## What to build", "## Acceptance criteria"],
	bug: ["## What happens", "## Expected", "## Steps to reproduce", "## Where"],
	task: ["## What to do", "## Done when"],
};

const KIND_NAME = { feature: "feature request", bug: "bug report", task: "task" };

const LIST_HINT = {
	feature: "Acceptance criteria are a checklist (- [ ] ...) a QA person can tick.",
	bug: "Steps are a numbered list. If the notes don't give them, say what QA should try first.",
	task: "Done when is a checklist (- [ ] ...).",
};

export function buildIssuePrompt(n: IssueNotes): string {
	return [
		"You write an issue for the team building the AEM Edge Delivery Services project in the current folder.",
		"You may read the project's files to be precise; you can't change them.",
		`It is a ${KIND_NAME[n.kind]}. Use only what the notes and the project say: never invent numbers, names or behaviour.`,
		"Write plain, short English. No em dashes and no semicolons.",
		"",
		"Answer in exactly this form and nothing else:",
		"TITLE: <one line, at most 80 characters>",
		"",
		"<the body in Markdown, with these headings in this order:>",
		...SECTIONS[n.kind],
		LIST_HINT[n.kind],
		"",
		`Title from the person: ${n.title}`,
		"Notes from the person:",
		n.notes.trim() || "(none)",
		...(n.block
			? [
					"",
					`It is about the block "${n.block.name}" (blocks/${n.block.name}/)${n.block.pages === null ? "" : `, which is on ${n.block.pages} pages of the site`}. Read its code if it helps.`,
				]
			: []),
	].join("\n");
}

/** The title and body from the agent's answer; without a TITLE line, the person's own title. */
export function parseIssue(reply: string, fallbackTitle: string): { title: string; body: string } {
	const text = reply.trim();
	const m = /^TITLE:\s*(.+)$/m.exec(text);
	const title = (m?.[1] ?? fallbackTitle).replace(/\s+/g, " ").trim().slice(0, 120);
	const body = (m ? text.slice((m.index ?? 0) + m[0].length) : text).trim();
	return { title, body };
}
