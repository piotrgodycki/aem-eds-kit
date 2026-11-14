/**
 * `eds draft content` on a draft with no sample content: the agent writes one
 * from the block's code, as the bare block fragment the preview uses, so the
 * table an author pastes has real rows and copy to replace.
 */

import { escapeRe } from "../track.js";

export function buildSamplePrompt(name: string, dir: string): string {
	return [
		`Write the sample authored content for the EDS block "${name}".`,
		`Its code is in ${dir}/ (read ${name}.js and ${name}.css, and _${name}.json if it's there). You can read the project's files; you can't change them.`,
		"",
		"Give exactly what an author would put in the block's table in a document, as the bare block fragment decorate() reads:",
		`<div class="${name}"><div><div>cell</div><div>cell</div></div>…</div> (one inner div per row, one per cell).`,
		"- Use the rows and cells the code expects, in its order; a cell holds headings, paragraphs, links or a picture as the code reads them.",
		'- Where the code expects an image, write <picture><img src="image.jpg" alt="…"></picture>.',
		"- Short, realistic English copy for the block's purpose (a headline, a line under it, a button); no lorem ipsum.",
		"Reply with the HTML only: no explanation, no code fence, no <html>, <head>, <body>, <style> or <script>.",
	].join("\n");
}

/** The fragment from the agent's reply; null when it holds no block for `name`. */
export function sampleFrom(reply: string, name: string): string | null {
	const html = reply
		.trim()
		.replace(/^```(?:html)?\n([\s\S]*?)\n```$/, "$1")
		.trim();
	return new RegExp(`<div\\b[^>]*\\bclass="${escapeRe(name)}\\b`).test(html) ? html : null;
}
