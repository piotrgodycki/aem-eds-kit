import chalk from "chalk";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { type Device, fetchBundles, summarizeRum, THRESHOLDS } from "../lib/rum.js";
import * as ui from "../lib/ui.js";

interface RumOptions {
	domain?: string;
	days?: string;
	device?: string;
}

const fmt = {
	lcp: (v: number | null) => (v === null ? "-" : `${(v / 1000).toFixed(1)} s`),
	inp: (v: number | null) => (v === null ? "-" : `${Math.round(v)} ms`),
	cls: (v: number | null) => (v === null ? "-" : v.toFixed(2)),
};

/**
 * `eds rum --domain <host>`: Core Web Vitals from the site's RUM data. The domain
 * key is read from EDS_RUM_DOMAINKEY only, never a flag, so it doesn't show in the
 * list of running processes.
 */
export async function rum(options: RumOptions): Promise<void> {
	const domain = options.domain?.trim().toLowerCase();
	const key = process.env.EDS_RUM_DOMAINKEY;
	const days = Math.min(31, Math.max(1, Number.parseInt(options.days ?? "7", 10) || 7));
	const device = (
		["mobile", "desktop", "all"].includes(options.device ?? "") ? options.device : "mobile"
	) as Device;
	if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
		logger.error("Name the site's domain: eds rum --domain www.example.com");
		process.exitCode = 1;
		return;
	}
	if (!key) {
		logger.error(
			"Set the site's RUM domain key in EDS_RUM_DOMAINKEY (Adobe gives one per site; aem-eds-studio keeps it in the keychain).",
		);
		process.exitCode = 1;
		return;
	}
	const { bundles, refused } = await fetchBundles(domain, key, days);
	if (refused && !bundles.length) {
		logger.error(`The RUM domain key was refused for ${domain}. Check the key and the domain.`);
		process.exitCode = 1;
		return;
	}
	const summary = summarizeRum(bundles, device);
	events.emit({ type: "rum", domain, days, device, ...summary });

	logger.info(
		ui.heading(`Core Web Vitals, ${domain}`, `${device}, the last ${days} days, 75th percentile`),
	);
	const rate = (m: "lcp" | "inp" | "cls", v: number | null) =>
		v === null
			? chalk.dim(fmt[m](v))
			: v <= THRESHOLDS[m][0]
				? chalk.green(fmt[m](v))
				: v <= THRESHOLDS[m][1]
					? chalk.yellow(fmt[m](v))
					: chalk.red(fmt[m](v));
	logger.info(
		`  LCP ${rate("lcp", summary.lcp.p75)}   INP ${rate("inp", summary.inp.p75)}   CLS ${rate("cls", summary.cls.p75)}   ${chalk.dim(`${Math.round(summary.pageViews)} page views`)}`,
	);
	if (summary.pages.length) {
		logger.info("");
		logger.info(chalk.dim("  Pages to look at"));
		for (const p of summary.pages)
			logger.info(
				`  ${p.path.padEnd(40)} LCP ${rate("lcp", p.lcp)}  INP ${rate("inp", p.inp)}  CLS ${rate("cls", p.cls)}  ${chalk.dim(String(Math.round(p.views)))}`,
			);
	}
}
