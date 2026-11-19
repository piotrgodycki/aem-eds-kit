import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import {
	type BlockUsage,
	blocksInPage,
	blockTraffic,
	countPages,
	indexPaths,
} from "../../lib/block-usage.js";
import { githubRepo, previewUrl } from "../../lib/draft-branch.js";
import { events } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import { fetchBundles } from "../../lib/rum.js";
import * as ui from "../../lib/ui.js";

interface UsageOptions {
	domain?: string;
	days?: string;
}

/** Enough pages for a fair count without hammering a large site. */
const MAX_PAGES = 400;

async function git(root: string, args: string[]): Promise<string | null> {
	const { execa } = await import("execa");
	try {
		return (await execa("git", args, { cwd: root })).stdout.trim() || null;
	} catch {
		return null;
	}
}

/** The site's origins to read pages from: the domain first, then the main branch's preview. */
async function siteOrigins(root: string, domain: string | undefined): Promise<string[]> {
	const origins = domain ? [`https://${domain}`] : [];
	const remote = await git(root, ["remote", "get-url", "origin"]);
	const repo = remote ? githubRepo(remote) : null;
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

/** The blocks on each page of the first origin whose query-index can be read. */
async function readPages(
	origins: string[],
	known: Set<string>,
): Promise<{ site: string | null; pages: Array<Set<string>> }> {
	for (const origin of origins) {
		const index = await getText(`${origin}/query-index.json?limit=${MAX_PAGES}`);
		if (!index) continue;
		let paths: string[];
		try {
			paths = indexPaths(JSON.parse(index)).slice(0, MAX_PAGES);
		} catch {
			continue;
		}
		const pages: Array<Set<string>> = [];
		// Eight at a time: quick on a small site, polite on a large one.
		for (let i = 0; i < paths.length; i += 8) {
			const batch = await Promise.all(
				paths
					.slice(i, i + 8)
					.map((p) => getText(`${origin}${p === "/" ? "/index" : p}.plain.html`)),
			);
			for (const html of batch) if (html !== null) pages.push(blocksInPage(html, known));
		}
		return { site: origin, pages };
	}
	return { site: null, pages: [] };
}

/** `eds block usage`: pages, views, clicks and the last change per block. */
export async function blockUsage(options: UsageOptions): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const blocksDir = path.join(root, "blocks");
	const blocks = existsSync(blocksDir)
		? (await readdir(blocksDir, { withFileTypes: true }))
				.filter((e) => e.isDirectory())
				.map((e) => e.name)
				.sort()
		: [];
	const domain = options.domain?.trim().toLowerCase();
	if (domain && !/^[a-z0-9.-]+$/.test(domain)) {
		logger.error("The domain is a host name, e.g. www.example.com");
		process.exitCode = 1;
		return;
	}
	const days = Math.min(31, Math.max(1, Number.parseInt(options.days ?? "30", 10) || 30));
	const key = process.env.EDS_RUM_DOMAINKEY;

	const { site, pages } = await readPages(await siteOrigins(root, domain), new Set(blocks));
	const pageCounts = site ? countPages(pages, blocks) : null;
	const traffic =
		domain && key ? blockTraffic((await fetchBundles(domain, key, days)).bundles, blocks) : null;

	const usage: BlockUsage[] = await Promise.all(
		blocks.map(async (name) => {
			const t = traffic?.get(name);
			return {
				name,
				pages: pageCounts?.get(name) ?? null,
				views: t ? Math.round(t.views) : null,
				clickRate: t?.views ? t.clicks / t.views : null,
				lastChange: await git(root, ["log", "-1", "--format=%cI", "--", `blocks/${name}`]),
			};
		}),
	);
	events.emit({
		type: "block-usage",
		site,
		pagesRead: pages.length,
		days: traffic ? days : null,
		blocks: usage,
	});

	logger.info(
		ui.heading(
			"Block usage",
			[
				site ? `${pages.length} pages from ${site}` : "the site's pages couldn't be read",
				traffic
					? `RUM, the last ${days} days`
					: domain
						? "no RUM (set EDS_RUM_DOMAINKEY)"
						: "no RUM (set --domain and EDS_RUM_DOMAINKEY)",
			].join(", "),
		),
	);
	for (const b of usage) {
		const pagesText =
			b.pages === null ? chalk.dim("-") : b.pages === 0 ? chalk.red("0") : String(b.pages);
		const views = b.views === null ? "" : `  ${b.views} views`;
		const rate = b.clickRate === null ? "" : `  ${(b.clickRate * 100).toFixed(1)}% click`;
		const changed = b.lastChange ? chalk.dim(`  changed ${b.lastChange.slice(0, 10)}`) : "";
		logger.info(`  ${b.name.padEnd(20)} ${pagesText} pages${views}${rate}${changed}`);
	}
}
