import chalk from "chalk";
import { type BlockUsage, blockTraffic, countPages } from "../../lib/block-usage.js";
import { events } from "../../lib/events.js";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import { fetchBundles } from "../../lib/rum.js";
import { git, projectBlocks, readSitePages, siteOrigins } from "../../lib/site-pages.js";
import * as ui from "../../lib/ui.js";

interface UsageOptions {
	domain?: string;
	days?: string;
}

/** `eds block usage`: pages, views, clicks and the last change per block. */
export async function blockUsage(options: UsageOptions): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const blocks = await projectBlocks(root);
	const domain = options.domain?.trim().toLowerCase();
	if (domain && !/^[a-z0-9.-]+$/.test(domain)) {
		logger.error("The domain is a host name, e.g. www.example.com");
		process.exitCode = 1;
		return;
	}
	const days = Math.min(31, Math.max(1, Number.parseInt(options.days ?? "30", 10) || 30));
	const key = process.env.EDS_RUM_DOMAINKEY;

	const { site, pages } = await readSitePages(await siteOrigins(root, domain), new Set(blocks));
	const pageCounts = site
		? countPages(
				pages.map((p) => p.blocks),
				blocks,
			)
		: null;
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
