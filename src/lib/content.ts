/**
 * Changing a page's content in DA (da.live) from a request in words, the way a
 * content author would ask: read the page, let the agent change what was asked,
 * show the sections that differ, and write it back only after a yes. The page
 * is the document DA stores: a <main> of section divs, each with its text and
 * its blocks as div tables.
 */

import { daSourceUrl } from "./template/da.js";

/** Read a page's document from DA. */
export async function readDaPage(
	org: string,
	site: string,
	path: string,
	token?: string,
): Promise<string> {
	const res = await fetch(daSourceUrl(org, site, path), {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
		signal: AbortSignal.timeout(20_000),
	});
	if (res.status === 401 || res.status === 403)
		throw new Error("DA refused to read the page. Set DA_TOKEN to a token with access to it.");
	if (res.status === 404) throw new Error(`There is no page ${path} in DA.`);
	if (!res.ok) throw new Error(`DA answered ${res.status} for ${path}.`);
	return res.text();
}

/** The top-level divs of the page's <main>: its sections, as HTML. */
function sectionsOf(html: string): string[] {
	const main = /<main[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1] ?? html;
	const sections: string[] = [];
	let depth = 0;
	let start = -1;
	for (const m of main.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)) {
		if (m[0][1] !== "/") {
			if (depth === 0) start = m.index ?? 0;
			depth++;
		} else if (depth > 0) {
			depth--;
			if (depth === 0) sections.push(main.slice(start, (m.index ?? 0) + m[0].length));
		}
	}
	return sections;
}

/**
 * A section's words, for showing what changed (as text, never as HTML): tags out,
 * repeated until none is left, blocks named, entities decoded with &amp; last so
 * "&amp;lt;" stays "&lt;".
 */
function sectionText(html: string): string {
	let text = html
		.replace(/<div class="([a-z0-9-]+)[^"]*">/gi, " [$1] ")
		.replace(/<(br|\/p|\/h[1-6]|\/li|\/div)\b[^>]*>/gi, " ");
	for (let before = ""; before !== text; ) {
		before = text;
		text = text.replace(/<[^>]*>/g, "");
	}
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

export interface SectionChange {
	/** 1-based, as a person counts sections. */
	section: number;
	before: string;
	after: string;
}

/** The sections whose words differ, before and after; an added or removed section has one side empty. */
export function changedSections(before: string, after: string): SectionChange[] {
	const a = sectionsOf(before).map(sectionText);
	const b = sectionsOf(after).map(sectionText);
	const out: SectionChange[] = [];
	for (let i = 0; i < Math.max(a.length, b.length); i++)
		if ((a[i] ?? "") !== (b[i] ?? ""))
			out.push({ section: i + 1, before: a[i] ?? "", after: b[i] ?? "" });
	return out;
}

export function buildContentPrompt(path: string, html: string, change: string): string {
	return [
		"You change the content of one page of an AEM Edge Delivery Services site, the way its content author asks.",
		"You may read the project's files (for example a block's code, to know what its table expects); you can't change them.",
		"",
		`The page is ${path}. This is its document as DA stores it: a <main> of sections (top-level divs); a block is a div whose class is its name, with one div per row and one div per cell.`,
		"Change only what the person asks. Keep every other section, block, row, link and image exactly as it is, and keep the block tables valid.",
		"Write plain English. No em dashes and no semicolons in text you add.",
		"",
		`The person asks: ${change.trim()}`,
		"",
		"Answer with the whole changed document in one ```html fence and nothing after it. Before the fence, say in one or two sentences what you changed.",
		"",
		"```html",
		html.trim(),
		"```",
	].join("\n");
}

/** The agent's answer: its short note and the changed document, or null without one. */
export function parseContentAnswer(reply: string): { note: string; html: string } | null {
	const m = /```html\s*\n([\s\S]*?)\n```/i.exec(reply);
	if (!m) return null;
	return { note: reply.slice(0, m.index).trim(), html: m[1].trim() };
}
