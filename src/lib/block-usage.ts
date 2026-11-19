/**
 * How much each block is used: on how many pages, how often people see and click
 * it (RUM), and when its code last changed. The numbers are for estimating work:
 * a block on no page can go, one on many pages needs wider testing, and one that
 * is seen but sends no events is a blind spot in the analytics.
 */

import type { RumBundle } from "./rum.js";

export interface BlockUsage {
	name: string;
	/** Pages that hold the block; null when the site's pages couldn't be read. */
	pages: number | null;
	/** Page views that showed the block, from RUM; null without RUM. */
	views: number | null;
	/** Share of those views with a click in the block, 0 to 1; null without views. */
	clickRate: number | null;
	/** ISO date of the last commit that touched blocks/<name>/, or null. */
	lastChange: string | null;
}

/** header and footer are loaded by the page scripts on every page, not written in the content. */
const ON_EVERY_PAGE = new Set(["header", "footer"]);

/**
 * The blocks one page holds, from its `.plain.html`: each block is a div whose
 * first class is the block's name, e.g. `<div class="cards dark">`.
 */
export function blocksInPage(html: string, known: Set<string>): Set<string> {
	const found = new Set<string>();
	for (const m of html.matchAll(/<div class="([a-z0-9-]+)[\s"]/g))
		if (known.has(m[1])) found.add(m[1]);
	return found;
}

/** How many of the pages hold each block. */
export function countPages(pages: Array<Set<string>>, blocks: string[]): Map<string, number> {
	const counts = new Map(blocks.map((b) => [b, 0]));
	for (const page of pages)
		for (const b of blocks)
			if (ON_EVERY_PAGE.has(b) || page.has(b)) counts.set(b, (counts.get(b) ?? 0) + 1);
	return counts;
}

/**
 * The block an event's source belongs to: the first part of the selector that names
 * a known block, by class (".cards a") or by tag (header, footer).
 */
export function blockOfSource(source: string | undefined, known: Set<string>): string | null {
	if (!source) return null;
	for (const part of source.split(/[\s>+~]+/)) {
		const [tag, ...classes] = part.split(".");
		for (const name of [...classes, tag]) if (known.has(name)) return name;
	}
	return null;
}

/**
 * Views and click rate per block. Each bundle is one sampled page view standing for
 * `weight` views: a block counts as seen once per bundle (`viewblock`) and as clicked
 * once per bundle with a `click` inside it.
 */
export function blockTraffic(
	bundles: RumBundle[],
	blocks: string[],
): Map<string, { views: number; clicks: number }> {
	const known = new Set(blocks);
	const out = new Map(blocks.map((b) => [b, { views: 0, clicks: 0 }]));
	for (const bundle of bundles) {
		const weight = bundle.weight || 1;
		const seen = new Set<string>();
		const clicked = new Set<string>();
		for (const e of bundle.events ?? []) {
			const block = blockOfSource(e.source, known);
			if (!block) continue;
			if (e.checkpoint === "viewblock") seen.add(block);
			else if (e.checkpoint === "click") clicked.add(block);
		}
		for (const [name, entry] of out) {
			if (seen.has(name)) entry.views += weight;
			if (clicked.has(name)) entry.clicks += weight;
		}
	}
	return out;
}

/** The pages listed in a site's query-index.json, as paths. */
export function indexPaths(index: unknown): string[] {
	const data = (index as { data?: Array<{ path?: unknown }> })?.data ?? [];
	return data.map((r) => r.path).filter((p): p is string => typeof p === "string");
}
