import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { DEFAULT_EVENTS, instrumentJs, type TrackEvents } from "../lib/track.js";
import * as ui from "../lib/ui.js";

interface TrackOptions {
	/** Track clicks on links/buttons. Default true (`--no-click` disables). */
	click?: boolean;
	/** The data layer event name for clicks (default block_click). */
	clickEvent?: string;
	/** Track form submits. Default true (`--no-submit` disables). */
	submit?: boolean;
	/** The event name for submits (default form_submit). */
	submitEvent?: string;
	/** Track the block coming into view: true for block_view, or an event name. */
	view?: boolean | string;
	/** Data layers to push to (repeatable); none means trackEvent from scripts/analytics.js. */
	layer?: string[];
	/** Also dispatch each event on the block as a bubbling CustomEvent. */
	dispatch?: boolean;
	/** Make the change a new draft version (review, branch, pull request) instead of editing blocks/. */
	draft?: boolean;
	/** With draft: commit the version on the draft's branch and push it. */
	push?: boolean;
	/** With draft: the branch a draft that starts here goes on. */
	branch?: string;
}

/** What to track, from the command's options. */
async function chosenEvents(options: TrackOptions): Promise<TrackEvents> {
	const { validLayers } = await import("../lib/track-page.js");
	return {
		click: options.click === false ? null : (options.clickEvent ?? DEFAULT_EVENTS.click),
		submit: options.submit === false ? null : (options.submitEvent ?? DEFAULT_EVENTS.submit),
		view: options.view
			? typeof options.view === "string"
				? options.view
				: DEFAULT_EVENTS.view
			: null,
		layers: options.layer?.length ? validLayers(options.layer) : [],
		dispatch: options.dispatch === true,
	};
}

/** In English, for the draft version's history: what this run tracks. */
function describeEvents(ev: TrackEvents): string {
	const what = [
		ev.click && `clicks as ${ev.click}`,
		ev.submit && `form submits as ${ev.submit}`,
		ev.view && `views as ${ev.view}`,
	].filter(Boolean);
	const where = ev.layers?.length ? ev.layers.join(", ") : "trackEvent (GTM)";
	return `Analytics: ${what.join(", ")}, to ${where}${ev.dispatch ? ", also as DOM events" : ""}`;
}

/**
 * `eds track block <name>` - instrument a block's `decorate()` with analytics:
 * clicks, form submits and views, as data layer events (and DOM events). With
 * --draft the change becomes the draft's next version instead of editing blocks/.
 */
export async function trackBlock(blockName: string, options: TrackOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Track block"));

	let events: TrackEvents;
	try {
		events = await chosenEvents(options);
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	if (options.draft) {
		await trackDraft(projectRoot, blockName, events, options);
		return;
	}

	const jsPath = path.join(projectRoot, "blocks", blockName, `${blockName}.js`);
	if (!existsSync(jsPath)) {
		logger.error(`Block "${blockName}" not found (no blocks/${blockName}/${blockName}.js).`);
		process.exitCode = 1;
		return;
	}
	const res = instrumentJs(await readFile(jsPath, "utf-8"), blockName, events);
	if (!res.changed) {
		logger.warn(`Not instrumented: ${res.reason}.`);
		return;
	}
	await writeFile(jsPath, res.js);
	reportTracked(projectRoot, `blocks/${blockName}/${blockName}.js`, events);
}

function reportTracked(projectRoot: string, file: string, events: TrackEvents) {
	logger.info(ui.heading("Instrumented"));
	logger.info(ui.accentLine(file, describeEvents(events).replace(/^Analytics: /, "")));
	if (!events.layers?.length && !existsSync(path.join(projectRoot, "scripts", "analytics.js"))) {
		logger.info("");
		logger.warn(
			"scripts/analytics.js is missing - run `eds integrate gtm` to create it, or pass --layer dataLayer.",
		);
	}
}

/** The tracking as the draft's next version: staged, checked and captured like an agent round. */
async function trackDraft(
	projectRoot: string,
	blockName: string,
	events: TrackEvents,
	options: TrackOptions,
): Promise<void> {
	const { readDraft, draftFromBlock, blockDir } = await import("../lib/draft.js");
	const { badBranchName } = await import("../lib/draft-branch.js");
	const bad = options.branch ? badBranchName(options.branch) : null;
	if (bad) {
		logger.error(bad);
		process.exitCode = 1;
		return;
	}
	const draft =
		(await readDraft(projectRoot, blockName)) ??
		(existsSync(blockDir(projectRoot, blockName))
			? await draftFromBlock(projectRoot, blockName, options.branch)
			: null);
	if (!draft) {
		logger.error(`No block or draft "${blockName}".`);
		process.exitCode = 1;
		return;
	}
	const from = draft.versions.at(-1)?.version;
	const { generateDraft, verifyGeneratedBlock } = await import("./block/from-design.js");
	let reason = "";
	await generateDraft({
		projectRoot,
		blockName,
		from,
		feedback: describeEvents(events),
		push: options.push,
		branch: options.branch,
		source: draft.source,
		run: async () => {
			const jsPath = path.join(projectRoot, "blocks", blockName, `${blockName}.js`);
			if (!existsSync(jsPath)) {
				reason = `no ${blockName}.js in the draft`;
				return false;
			}
			const res = instrumentJs(await readFile(jsPath, "utf-8"), blockName, events);
			if (!res.changed) {
				reason = res.reason ?? "nothing changed";
				return false;
			}
			await writeFile(jsPath, res.js);
			return true;
		},
		verify: (dir) => verifyGeneratedBlock(dir, blockName, false),
		writeMeta: async () => {},
	});
	if (reason) logger.warn(`Not instrumented: ${reason}.`);
}

interface TrackPageOptions {
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
