import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { blocksInPage, indexPaths } from "./block-usage.js";
import { githubRepo, previewUrl } from "./draft-branch.js";

/**
 * The site's pages and the blocks on each, read from its query-index.json and each
 * page's .plain.html. Shared by `eds block usage` and `eds pr scope`.
 */

/** Enough pages for a fair count without hammering a large site. */
const MAX_PAGES = 400;

/** A git command's output in the project, or null when it fails or prints nothing. */
export async function git(root: string, args: string[]): Promise<string | null> {
	const { execa } = await import("execa");
	try {
		return (await execa("git", args, { cwd: root })).stdout.trim() || null;
	} catch {
		return null;
	}
}

/** The project's GitHub owner and repository, from its origin remote. */
export async function originRepo(root: string): Promise<{ owner: string; repo: string } | null> {
	const remote = await git(root, ["remote", "get-url", "origin"]);
	return remote ? githubRepo(remote) : null;
}

/** The project's block folders, sorted. */
export async function projectBlocks(root: string): Promise<string[]> {
	const dir = path.join(root, "blocks");
	if (!existsSync(dir)) return [];
	return (await readdir(dir, { withFileTypes: true }))
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
}

/** The site's origins to read pages from: the domain first, then the main branch's preview. */
export async function siteOrigins(root: string, domain: string | undefined): Promise<string[]> {
	const origins = domain ? [`https://${domain}`] : [];
	const repo = await originRepo(root);
	if (repo) origins.push(previewUrl(repo, "main").replace(/\/$/, ""));
	return origins;
}

async function getText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
		return res.ok ? await res.text() : null;
	} catch {
		return null;
	}
}

export interface SitePage {
	path: string;
	blocks: Set<string>;
}

/** The blocks on each page of the first origin whose query-index can be read. */
export async function readSitePages(
	origins: string[],
	known: Set<string>,
): Promise<{ site: string | null; pages: SitePage[] }> {
	for (const origin of origins) {
		const index = await getText(`${origin}/query-index.json?limit=${MAX_PAGES}`);
		if (!index) continue;
		let paths: string[];
		try {
			paths = indexPaths(JSON.parse(index)).slice(0, MAX_PAGES);
		} catch {
			continue;
		}
		const pages: SitePage[] = [];
		// Eight at a time: quick on a small site, polite on a large one.
		for (let i = 0; i < paths.length; i += 8) {
			const batch = paths.slice(i, i + 8);
			const htmls = await Promise.all(
				batch.map((p) => getText(`${origin}${p === "/" ? "/index" : p}.plain.html`)),
			);
			htmls.forEach((html, j) => {
				if (html !== null) pages.push({ path: batch[j], blocks: blocksInPage(html, known) });
			});
		}
		return { site: origin, pages };
	}
	return { site: null, pages: [] };
}
