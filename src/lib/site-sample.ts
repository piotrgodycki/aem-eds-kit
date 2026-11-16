/**
 * A draft's sample content taken from the site itself, never a random picture.
 *
 * 1. A draft with no sample takes the block's real content from a published page
 *    of the site (the main branch on aem.page), texts and images.
 * 2. Otherwise each image the agent wrote that isn't the site's own becomes one of
 *    the site's images (its first `media_` image),
 * 3. or, when the site has none, a neutral grey box.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { githubRepo, previewUrl } from "./draft-branch.js";
import { escapeRe } from "./track.js";

/** Pages read at most, so a large site doesn't hold up a draft. */
const MAX_PAGES = 20;
const TIMEOUT_MS = 4000;

/** A grey box that says "image", for a site with no images of its own. */
export const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#d9d9d6"/><text x="800" y="470" font-family="sans-serif" font-size="56" fill="#8a8a85" text-anchor="middle">image</text></svg>',
)}`;

type Fetch = (url: string) => Promise<string | null>;

export const fetchText: Fetch = async (url) => {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		return res.ok ? await res.text() : null;
	} catch {
		return null;
	}
};

/** The site's main branch on aem.page, from the project's GitHub remote; null without one. */
export async function siteBase(root: string): Promise<string | null> {
	try {
		const { execa } = await import("execa");
		const url = (await execa("git", ["remote", "get-url", "origin"], { cwd: root })).stdout;
		const remote = githubRepo(url);
		return remote ? previewUrl(remote, "main") : null;
	} catch {
		return null;
	}
}

/** The site's page paths: the home page first, then the query index's pages, 20 at most. */
export async function sitePaths(base: string, get: Fetch): Promise<string[]> {
	const paths = ["/"];
	const index = await get(new URL("query-index.json", base).href);
	try {
		for (const row of (JSON.parse(index ?? "{}").data ?? []) as Array<{ path?: string }>)
			if (row.path && !paths.includes(row.path)) paths.push(row.path);
	} catch {
		// no index: the home page alone
	}
	return paths.slice(0, MAX_PAGES);
}

/** The site's pages as plain HTML. */
async function sitePages(base: string, get: Fetch): Promise<string[]> {
	const plain = (p: string) => new URL(p === "/" ? "index.plain.html" : `${p}.plain.html`, base);
	const pages = await Promise.all((await sitePaths(base, get)).map((p) => get(plain(p).href)));
	return pages.filter((p): p is string => !!p);
}

/** The first `<div class="<name> …">` in a page, with everything inside it. */
export function blockOn(html: string, name: string): string | null {
	const start = html.search(new RegExp(`<div class="${escapeRe(name)}(?:[\\s"])`));
	if (start < 0) return null;
	const tags = /<div\b|<\/div>/g;
	tags.lastIndex = start;
	let depth = 0;
	for (let m = tags.exec(html); m; m = tags.exec(html)) {
		depth += m[0] === "</div>" ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return null;
}

/** The site's media links (`./media_…`) made absolute, so the draft's preview loads them. */
export function absoluteMedia(html: string, base: string): string {
	return html.replace(
		/(["\s,])\.?\/(media_[^"\s,]+)/g,
		(_, before, file) => `${before}${base}${file}`,
	);
}

/** The first of the site's own images in a page, as an absolute URL. */
export function firstMedia(html: string, base: string): string | null {
	const m = html.match(/<img[^>]*\ssrc="\.?\/(media_[^"]+)"/);
	return m ? `${base}${m[1]}` : null;
}

/** Every image that isn't the site's own becomes `image`; a picture's other sources go. */
export function withImage(sample: string, image: string): string {
	const own = (src: string) => /\/media_[^/]*$/.test(src.split("?")[0]);
	return sample
		.replace(/<source\b[^>]*>/g, (tag) => (/srcset="[^"]*media_/.test(tag) ? tag : ""))
		.replace(/(<img\b[^>]*\ssrc=")([^"]*)(")/g, (tag, before, src, after) =>
			own(src) ? tag : `${before}${image}${after}`,
		);
}

/** Apply the rules above to the sample in a draft version's folder. Never throws. */
export async function useSiteContent(
	root: string,
	name: string,
	dir: string,
	get: Fetch = fetchText,
): Promise<void> {
	try {
		const file = path.join(dir, `_${name}.preview.html`);
		const sample = existsSync(file) ? await readFile(file, "utf-8") : null;
		if (sample !== null && !/<img\b/.test(sample)) return;
		const base = await siteBase(root);
		const pages = base ? await sitePages(base, get) : [];
		if (sample === null) {
			const block = pages.map((p) => blockOn(p, name)).find(Boolean);
			// EDS adds "block" when it decorates; the draft's mock carries it, as the agent's do.
			const decorated = block?.replace(/^<div class="([^"]*)"/, '<div class="$1 block"');
			if (decorated && base) await writeFile(file, `${absoluteMedia(decorated, base)}\n`);
			return;
		}
		const image =
			(base && pages.map((p) => firstMedia(p, base)).find(Boolean)) || PLACEHOLDER_IMAGE;
		const fixed = withImage(sample, image);
		if (fixed !== sample) await writeFile(file, fixed);
	} catch {
		// The sample stays as it was: a draft never fails over its pictures.
	}
}
