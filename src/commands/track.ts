import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { instrumentJs } from "../lib/track.js";
import * as ui from "../lib/ui.js";

export interface TrackOptions {
	/** Instrument clicks on links/buttons. Default true (`--no-click` disables). */
	click?: boolean;
	/** Instrument form submits. Default true (`--no-submit` disables). */
	submit?: boolean;
}

/**
 * `eds track block <name>` - instrument a block's `decorate()` with dataLayer
 * tracking (click + form submit) via `trackEvent` from `scripts/analytics.js`.
 */
export async function trackBlock(blockName: string, options: TrackOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Track block"));

	const jsPath = path.join(projectRoot, "blocks", blockName, `${blockName}.js`);
	if (!existsSync(jsPath)) {
		logger.error(`Block "${blockName}" not found (no blocks/${blockName}/${blockName}.js).`);
		process.exitCode = 1;
		return;
	}

	const events = { click: options.click !== false, submit: options.submit !== false };
	const res = instrumentJs(await readFile(jsPath, "utf-8"), blockName, events);
	if (!res.changed) {
		logger.warn(`Not instrumented: ${res.reason}.`);
		return;
	}
	await writeFile(jsPath, res.js);

	logger.info(ui.heading("Instrumented"));
	const picked = [events.click ? "block_click" : null, events.submit ? "form_submit" : null].filter(
		Boolean,
	);
	logger.info(ui.accentLine(`blocks/${blockName}/${blockName}.js`, picked.join(" + ")));
	if (!existsSync(path.join(projectRoot, "scripts", "analytics.js"))) {
		logger.info("");
		logger.warn("scripts/analytics.js is missing - run `eds integrate gtm` to create it.");
	}
	logger.info("");
	logger.info(chalk.dim("  Events push to window.dataLayer via trackEvent - GTM picks them up."));
}

export interface TrackPageOptions {
	/** Data layers to push to (repeatable). Default: dataLayer. */
	layer?: string[];
}

/**
 * `eds track page` - give every part of the page an id and report it to one or
 * more data layers, with the page's metadata pushed first (before GTM).
 */
export async function trackPage(options: TrackPageOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const tp = await import("../lib/track-page.js");
	let layers: string[];
	try {
		layers = tp.validLayers(options.layer ?? []);
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Track page"));
	const scripts = path.join(projectRoot, "scripts");
	const rel = (f: string) => `scripts/${f}`;
	const done: Array<[string, string]> = [];

	await writeFile(path.join(scripts, "data-layers.js"), tp.dataLayersJs(layers));
	done.push([rel("data-layers.js"), `pushes to ${layers.join(", ")}`]);
	await writeFile(path.join(scripts, "components.js"), tp.COMPONENTS_JS);
	done.push([rel("components.js"), "header, footer, sections, blocks: ids + view/click"]);

	// page-meta.js: keep one the team has extended; replace the stock one.
	const metaPath = path.join(scripts, "page-meta.js");
	const meta = existsSync(metaPath) ? await readFile(metaPath, "utf-8") : "";
	if (!meta || meta.includes("Extend `pageMeta` with the fields your container expects")) {
		await writeFile(metaPath, tp.PAGE_META_JS);
		done.push([rel("page-meta.js"), "page_meta, pushed before GTM"]);
	} else {
		logger.warn(
			"scripts/page-meta.js was customised - kept. Import trackEvent from './data-layers.js' in it.",
		);
	}

	const analyticsPath = path.join(scripts, "analytics.js");
	const hasGtm = existsSync(analyticsPath);
	if (hasGtm) {
		const patched = tp.patchAnalytics(await readFile(analyticsPath, "utf-8"));
		if (patched.changed) {
			await writeFile(analyticsPath, patched.js);
			done.push([rel("analytics.js"), "trackEvent now goes to every layer"]);
		}
	} else {
		await writeFile(
			analyticsPath,
			"// scripts/analytics.js - see data-layers.js (eds track page).\nexport { trackEvent } from './data-layers.js';\n",
		);
		done.push([rel("analytics.js"), "trackEvent for blocks (eds track block)"]);
	}

	const delayedPath = path.join(scripts, "delayed.js");
	const delayed = existsSync(delayedPath) ? await readFile(delayedPath, "utf-8") : "";
	if (!delayed.includes(tp.PAGE_MARKER)) {
		const loadsGtm = delayed.includes("loadGTM");
		const base = tp.stripGtmStart(delayed).replace(/\s*$/, "");
		await writeFile(delayedPath, `${base ? `${base}\n\n` : ""}${tp.delayedSnippet(loadsGtm)}`);
		done.push([
			rel("delayed.js"),
			loadsGtm ? "page meta → GTM → components" : "page meta → components",
		]);
	}

	logger.info(ui.heading("Tracking the page"));
	const w = ui.columnWidth(done.map(([f]) => f));
	for (const [f, what] of done) logger.info(ui.accentLine(f, what, w));
	logger.info("");
	logger.info(
		chalk.dim(
			"  Starts after LCP (delayed phase). Events: page_meta, component_view, component_click.",
		),
	);
}
