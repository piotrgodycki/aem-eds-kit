import type { Draft } from "../draft.js";

/**
 * `eds draft describe`: the pull request for an accepted draft, written by
 * the agent in English. The reviewers' comments are notes in any language and
 * tone; the description says what the block is and what review changed, in
 * plain words for a developer who reviews the code.
 */

export function buildDescribePrompt(draft: Draft, version: number, dir: string): string {
	const rounds = draft.versions
		.filter((v) => v.version <= version && v.feedback)
		.map((v) => `- v${v.version}: ${v.feedback}`);
	return [
		`Write the pull request for the EDS block "${draft.name}", version ${version}.`,
		`Its files are in ${dir}/ (read ${draft.name}.js, ${draft.name}.css and _${draft.name}.preview.html). You can read the project's files; you can't change them.`,
		draft.source.fromBlock
			? `It changes the existing block in blocks/${draft.name}/.`
			: `It is a new block${draft.source.designRef ? `, built from the design ${draft.source.designRef}` : ""}.`,
		"",
		"The reviewers asked for these changes, in their own words (any language, rough notes; some repeat):",
		rounds.length ? rounds.join("\n") : "- (none: the first version was accepted)",
		"",
		"Write in English, for a developer who reviews and merges the code. Never quote the reviewers' notes; say in a few words what changed.",
		"Reply with exactly this and nothing else:",
		"- line 1: the title, as a Conventional Commit, e.g. feat(blocks): hero with a bottom-left headline over a dark gradient",
		"- a blank line",
		"- the description in Markdown with these sections: ## Summary (two or three sentences: what the block shows and how authors use it), ## Changes in review (one bullet per distinct change, in the order they were made, no duplicates), ## How to check (what to look at on desktop and phone).",
		"No screenshots, links or file lists: they are added separately.",
	].join("\n");
}

/** The title and body from the agent's reply; null when it doesn't look like one. */
export function splitDescription(reply: string): { title: string; body: string } | null {
	const text = reply.trim().replace(/^```(?:markdown)?\n([\s\S]*?)\n```$/, "$1");
	const [first, ...rest] = text.split("\n");
	const title = first.replace(/^#+\s*/, "").trim();
	const body = rest.join("\n").trim();
	return title && body && title.length <= 120 ? { title, body } : null;
}
