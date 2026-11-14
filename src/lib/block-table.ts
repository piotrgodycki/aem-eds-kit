/**
 * A block's authored content as the table an author pastes into a document
 * (Document Authoring, Word, Google Docs): the block's name in the first row,
 * then its rows and cells. It reads the bare block fragment the preview uses
 * (`<div class="hero dark"><div><div>cell</div>…</div>…</div>`).
 */

interface BlockTable {
	/** For the clipboard (text/html): pastes as a table. */
	html: string;
	/** For the clipboard (text/plain): one line per row, cells split by tabs. */
	text: string;
}

/** The direct child `<div>`s of a fragment, as their inner HTML (nested divs kept whole). */
export function childDivs(html: string): string[] {
	const children: string[] = [];
	const tag = /<(\/?)div\b[^>]*>/gi;
	let depth = 0;
	let start = -1;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		if (!m[1]) {
			if (depth === 0) start = m.index + m[0].length;
			depth++;
		} else if (depth > 0) {
			depth--;
			if (depth === 0) children.push(html.slice(start, m.index));
		}
	}
	return children;
}

/** "hero" + ["dark", "wide"] → "Hero (dark, wide)", as authors write it. */
function tableName(classes: string[]): string {
	const [name, ...variants] = classes.filter((c) => c !== "block");
	const title = (name ?? "block")
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
	return variants.length ? `${title} (${variants.join(", ")})` : title;
}

/** Relative `src`/`href`s made absolute on `base`, so images and links still work once pasted. */
function absolute(html: string, base?: string): string {
	if (!base) return html;
	return html.replace(/\b(src|href)="([^"]+)"/gi, (all, attr: string, url: string) => {
		if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return all;
		try {
			return `${attr}="${new URL(url, base).href}"`;
		} catch {
			return all;
		}
	});
}

const plain = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The first block in `fragment` as a table, or null when there is none.
 * `base` (the draft's aem.page preview) makes relative URLs absolute.
 */
export function blockTable(fragment: string, base?: string): BlockTable | null {
	const open = fragment.match(/<div\b[^>]*\bclass="([^"]+)"[^>]*>/i);
	if (open?.index === undefined) return null;
	const [block] = childDivs(fragment.slice(open.index));
	if (block === undefined) return null;
	const name = tableName(open[1].trim().split(/\s+/));
	const rows = childDivs(block).map((row) => {
		const cells = childDivs(row);
		// A row without cell divs is one cell holding the row itself.
		return (cells.length ? cells : [row]).map((c) => absolute(c.trim(), base));
	});
	const width = Math.max(1, ...rows.map((r) => r.length));
	const html = [
		"<table>",
		`<tr><td colspan="${width}">${esc(name)}</td></tr>`,
		...rows.map(
			(cells) =>
				`<tr>${cells
					.map((c, i) =>
						// The last cell spans what the row lacks, so every row fills the table.
						i === cells.length - 1 && cells.length < width
							? `<td colspan="${width - i}">${c}</td>`
							: `<td>${c}</td>`,
					)
					.join("")}</tr>`,
		),
		"</table>",
	].join("\n");
	const text = [name, ...rows.map((cells) => cells.map(plain).join("\t"))].join("\n");
	return { html, text };
}
