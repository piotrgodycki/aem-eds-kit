/**
 * What a branch touches, for the "What to test" part of a pull request: the blocks
 * it changes and the pages they are on, shared code that reaches every page, and
 * authoring changes to check in the Universal Editor. It turns a diff into a QA
 * list and a scale for the estimate.
 */

export interface FileScope {
	/** Blocks whose folder changed. */
	blocks: string[];
	/** Code every page loads: styles, scripts, head.html, fonts. */
	shared: string[];
	/** Universal Editor models, definitions and filters. */
	authoring: string[];
	/** Anything else (tooling, docs, config). */
	other: string[];
}

const SHARED = /^(styles|scripts|fonts)\/|^head\.html$|^404\.html$/;
const AUTHORING =
	/^component-(models|definition|filters)\.json$|^models\/|^blocks\/[^/]+\/_[^/]+\.json$/;

/** The changed files sorted by what QA has to look at. */
export function classifyFiles(files: string[]): FileScope {
	const scope: FileScope = { blocks: [], shared: [], authoring: [], other: [] };
	const blocks = new Set<string>();
	for (const file of files) {
		const block = /^blocks\/([^/]+)\//.exec(file)?.[1];
		if (block) blocks.add(block);
		if (AUTHORING.test(file)) scope.authoring.push(file);
		else if (SHARED.test(file)) scope.shared.push(file);
		else if (!block) scope.other.push(file);
	}
	scope.blocks = [...blocks].sort();
	return scope;
}

export interface BlockPages {
	name: string;
	/** Pages that hold the block; null when the site's pages couldn't be read. */
	pages: number | null;
	/** A few of those pages, as paths. */
	examples: string[];
}

/** header and footer are on every page. */
const ON_EVERY_PAGE = new Set(["header", "footer"]);

/** The pages each block is on, with up to `examples` of them, from the site's pages. */
export function pagesForBlocks(
	blocks: string[],
	pages: Array<{ path: string; blocks: Set<string> }> | null,
	examples = 3,
): BlockPages[] {
	return blocks.map((name) => {
		if (!pages) return { name, pages: null, examples: [] };
		const on = pages.filter((p) => ON_EVERY_PAGE.has(name) || p.blocks.has(name));
		return { name, pages: on.length, examples: on.slice(0, examples).map((p) => p.path) };
	});
}

/**
 * The "What to test" section in Markdown. `preview` is the branch's aem.page
 * preview, so each example page opens with the change in it.
 */
export function scopeMarkdown(
	scope: FileScope,
	blocks: BlockPages[],
	preview: string | null,
): string {
	const link = (p: string) => (preview ? `[${p}](${preview.replace(/\/$/, "")}${p})` : p);
	const out = ["## What to test", ""];
	if (blocks.length) {
		out.push("Blocks changed:");
		for (const b of blocks) {
			const where =
				b.pages === null
					? "its pages couldn't be read"
					: b.pages === 0
						? "on no page yet"
						: `on ${b.pages} ${b.pages === 1 ? "page" : "pages"}, e.g. ${b.examples.map(link).join(", ")}`;
			out.push(`- \`${b.name}\`: ${where}`);
		}
		out.push("");
	}
	if (scope.shared.length) {
		out.push("Shared code changed, so every page can be affected:");
		for (const f of scope.shared) out.push(`- \`${f}\``);
		out.push("");
	}
	if (scope.authoring.length) {
		out.push("Authoring changed, check these fields in the Universal Editor:");
		for (const f of scope.authoring) out.push(`- \`${f}\``);
		out.push("");
	}
	if (!blocks.length && !scope.shared.length && !scope.authoring.length)
		out.push(
			"No block, shared code or authoring change: nothing on the site's pages to retest.",
			"",
		);
	if (preview) out.push(`Every page opens with this change on ${preview}`);
	return out.join("\n").trim();
}
