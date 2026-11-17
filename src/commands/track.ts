import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { DEFAULT_EVENTS, instrumentJs, type TrackEvents } from "../lib/track.js";
import * as ui from "../lib/ui.js";
import type { AgentType } from "../types/index.js";

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
	/** Clicks on an element in the block, as "<selector>=<event>" (repeatable). */
	on?: string[];
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

/** "<selector>=<event>" from --on: the last = splits, so a selector may hold one. */
function parseOn(values: string[] = []): Array<{ selector: string; event: string }> {
	return values.map((v) => {
		const at = v.lastIndexOf("=");
		if (at < 1)
			throw new Error(`--on "${v}": write it as "<selector>=<event>", e.g. ".cta=promo_click".`);
		return { selector: v.slice(0, at).trim(), event: v.slice(at + 1).trim() };
	});
}

/** What to track, from the command's options, with the project's own events. */
async function chosenEvents(options: TrackOptions): Promise<TrackEvents> {
	const { validLayers } = await import("../lib/track-page.js");
	const { projectEvents } = await import("./track-events.js");
	const root = findProjectRoot();
	return {
		on: parseOn(options.on),
		defs: root ? await projectEvents(root) : {},
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
		...(ev.on ?? []).map((o) => `clicks on ${o.selector} as ${o.event}`),
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
	/** Data layers to push to (repeatable). Default: the ones already set, else dataLayer. */
	layer?: string[];
	/** pageMeta to save in .edsrc.json first, as JSON (aem-eds-studio's editor). */
	setPageMeta?: string;
	/** Commit the files on this branch and push it, leaving the working tree as it was. */
	branch?: string;
	/** Let the agent write each function that is still a stub. */
	writeFunctions?: boolean;
	agent?: string;
	model?: string;
}

/** Every file `eds track page` may write, for a commit on a branch. */
const TRACK_FILES = [
	".edsrc.json",
	"scripts/data-layers.js",
	"scripts/components.js",
	"scripts/page-meta.js",
	"scripts/page-meta-custom.js",
	"scripts/analytics.js",
	"scripts/delayed.js",
];

/** The layers data-layers.js already pushes to, so a re-run keeps them. */
async function currentLayers(root: string): Promise<string[]> {
	try {
		const js = await readFile(path.join(root, "scripts", "data-layers.js"), "utf-8");
		return JSON.parse(/export const LAYERS = (\[[^\]]*\]);/.exec(js)?.[1] ?? "[]") as string[];
	} catch {
		return [];
	}
}

/**
 * `eds track page` - give every part of the page an id and report it to one or
 * more data layers, with the page's metadata pushed first (before GTM).
 */
/** Save pageMeta in .edsrc.json, checked first, keeping everything else in it. */
async function savePageMeta(root: string, raw: unknown): Promise<void> {
	const { parsePageMeta } = await import("../lib/page-meta.js");
	const pageMeta = parsePageMeta(raw);
	const file = path.join(root, ".edsrc.json");
	let config: Record<string, unknown> = {};
	try {
		config = JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;
	} catch {
		// no config yet
	}
	await writeFile(file, `${JSON.stringify({ ...config, pageMeta }, null, 2)}\n`);
}

/** pageMeta from the project's .edsrc.json as written, so a mistake in it is reported, not dropped. */
async function projectPageMeta(root: string): Promise<unknown> {
	try {
		return (
			JSON.parse(await readFile(path.join(root, ".edsrc.json"), "utf-8")) as { pageMeta?: unknown }
		).pageMeta;
	} catch {
		return undefined;
	}
}

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
		layers = tp.validLayers(
			options.layer?.length ? options.layer : await currentLayers(projectRoot),
		);
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Track page"));
	if (options.branch) {
		const { badBranchName } = await import("../lib/draft-branch.js");
		const bad = badBranchName(options.branch);
		if (bad) {
			logger.error(bad);
			process.exitCode = 1;
			return;
		}
	}
	// With --branch, the files go on the branch and the working tree is put back as it was.
	const before = new Map<string, string | null>();
	for (const rel of TRACK_FILES) {
		const file = path.join(projectRoot, rel);
		before.set(rel, existsSync(file) ? await readFile(file, "utf-8") : null);
	}
	if (options.setPageMeta !== undefined) {
		try {
			await savePageMeta(projectRoot, JSON.parse(options.setPageMeta));
		} catch (err) {
			logger.error(
				err instanceof SyntaxError ? "--set-page-meta isn't valid JSON." : (err as Error).message,
			);
			process.exitCode = 1;
			return;
		}
	}
	const scripts = path.join(projectRoot, "scripts");
	const rel = (f: string) => `scripts/${f}`;
	const done: Array<[string, string]> = [];

	await writeFile(path.join(scripts, "data-layers.js"), tp.dataLayersJs(layers));
	done.push([rel("data-layers.js"), `pushes to ${layers.join(", ")}`]);
	await writeFile(path.join(scripts, "components.js"), tp.COMPONENTS_JS);
	done.push([rel("components.js"), "header, footer, sections, blocks: ids + view/click"]);

	// page-meta.js is written from pageMeta in .edsrc.json; one a developer wrote by hand is kept.
	const pm = await import("../lib/page-meta.js");
	let pageMeta: Awaited<ReturnType<typeof pm.parsePageMeta>>;
	try {
		pageMeta = pm.parsePageMeta(await projectPageMeta(projectRoot));
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	const metaPath = path.join(scripts, "page-meta.js");
	const meta = existsSync(metaPath) ? await readFile(metaPath, "utf-8") : "";
	const ours =
		!meta ||
		meta.includes(pm.GENERATED_MARK) ||
		meta.includes("Add the fields your tags need.") ||
		meta.includes("Extend `pageMeta` with the fields your container expects");
	if (ours) {
		await writeFile(metaPath, pm.pageMetaJs(pageMeta));
		const extra = pageMeta.properties.map((p) => p.name);
		done.push([
			rel("page-meta.js"),
			`${pageMeta.event}, pushed before GTM${extra.length ? ` (${extra.join(", ")})` : ""}`,
		]);
	} else {
		logger.warn(
			"scripts/page-meta.js was written by hand - kept. Remove it to have it written from pageMeta in .edsrc.json.",
		);
	}
	if (pm.functionNames(pageMeta).length) {
		const customPath = path.join(scripts, "page-meta-custom.js");
		const before = existsSync(customPath) ? await readFile(customPath, "utf-8") : "";
		const after = pm.withStubs(before, pageMeta);
		if (after !== before) {
			await writeFile(customPath, after);
			done.push([rel("page-meta-custom.js"), "a stub for each new function"]);
		}
		// The agent writes each function that is still a stub, so one run can commit them too.
		if (options.writeFunctions) {
			for (const p of pageMeta.properties) {
				if (p.from !== "function" || !p.describe) continue;
				const now = await readFile(customPath, "utf-8");
				if (!pm.isStub(now, p.key as string)) continue;
				if (await writeFunction(projectRoot, p.key as string, p.describe, options))
					done.push([rel("page-meta-custom.js"), `${p.key}() written by the agent`]);
			}
		}
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

	if (options.branch) {
		const { commitFilesOnBranch } = await import("../lib/draft-branch.js");
		const changed: string[] = [];
		for (const rel of TRACK_FILES) {
			const file = path.join(projectRoot, rel);
			const now = existsSync(file) ? await readFile(file, "utf-8") : null;
			if (now !== before.get(rel)) changed.push(rel);
		}
		try {
			const r = await commitFilesOnBranch(
				projectRoot,
				options.branch,
				// Only what this run changed: someone's other local edits stay out of the commit.
				changed,
				"Tracking: page_meta and the data layers (eds track page)",
			);
			events.emit({ type: "pushed", name: "page", version: 0, ...r });
			done.push([
				r.branch,
				r.pushed ? "committed and pushed" : "committed (no GitHub remote to push to)",
			]);
		} finally {
			for (const [rel, content] of before) {
				const file = path.join(projectRoot, rel);
				if (content === null) await rm(file, { force: true });
				else await writeFile(file, content);
			}
		}
	}

	logger.info(ui.heading("Tracking the page"));
	const w = ui.columnWidth(done.map(([f]) => f));
	for (const [f, what] of done) logger.info(ui.accentLine(f, what, w));
	logger.info("");
	logger.info(
		chalk.dim(
			`  Starts after LCP (delayed phase). Events: ${pageMeta.event}, component_view, component_click.`,
		),
	);
}

/** The agent writes one page_meta function into scripts/page-meta-custom.js; its code, or null. */
async function writeFunction(
	root: string,
	name: string,
	describe: string,
	options: { agent?: string; model?: string },
): Promise<string | null> {
	const pm = await import("../lib/page-meta.js");
	const { loadConfig } = await import("../lib/config.js");
	const { detectAgent } = await import("../lib/agents/detect.js");
	const { isLocalAgent } = await import("../lib/agents/local.js");
	const { askAgent } = await import("../lib/agents/ask.js");
	const config = await loadConfig(root);
	const agent = await detectAgent((options.agent as AgentType) || config.agent);
	if (!agent) {
		logger.error("No AI agent found (claude, cursor, codex, or a local Ollama / oMLX server).");
		return null;
	}
	const model = isLocalAgent(agent.type)
		? (options.model ?? agent.model)
		: (options.model ?? config.model);
	logger.info(`  ${chalk.dim("→")} ${agent.type} writes ${name}(): ${chalk.dim(describe)}`);
	const reply = await askAgent(agent, pm.buildFunctionPrompt(name, describe), root, model, {
		contextTokens: config.local?.contextTokens,
		apiKey: config.local?.apiKey,
	});
	const code = reply ? pm.functionFrom(reply, name) : null;
	if (!code) {
		logger.error(`The agent's answer had no \`export function ${name}()\`. It stays as it was.`);
		return null;
	}
	const file = path.join(root, "scripts", "page-meta-custom.js");
	const before = existsSync(file) ? await readFile(file, "utf-8") : "";
	await writeFile(file, pm.replaceFunction(before, name, code));
	events.emit({ type: "page-function", name, file: "scripts/page-meta-custom.js", code });
	return code;
}

/** `eds track page-function <name> <what it returns>`: the agent writes one page_meta function. */
export async function trackPageFunction(
	name: string,
	describe: string,
	options: { agent?: string; model?: string } = {},
): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	if (!/^[A-Za-z_$][\w$]*$/.test(name) || !describe.trim()) {
		logger.error(
			'Name the function and say what it returns: eds track page-function isLoggedIn "…"',
		);
		process.exitCode = 1;
		return;
	}
	const code = await writeFunction(root, name, describe.trim(), options);
	if (!code) {
		process.exitCode = 1;
		return;
	}
	logger.success(`${name}() → scripts/page-meta-custom.js`);
	logger.info(code);
}

/** `eds track page-check [--base <url>]`: the site's pages against pageMeta's rules. */
export async function trackPageCheck(options: { base?: string } = {}): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const pm = await import("../lib/page-meta.js");
	const site = await import("../lib/site-sample.js");
	let config: Awaited<ReturnType<typeof pm.parsePageMeta>>;
	try {
		config = pm.parsePageMeta(await projectPageMeta(root));
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	const base = options.base ? `${options.base.replace(/\/?$/, "/")}` : await site.siteBase(root);
	if (!base || !/^https:\/\//.test(base)) {
		logger.error(
			"No site to read: give --base https://main--site--owner.aem.page/, or add a GitHub remote.",
		);
		process.exitCode = 1;
		return;
	}
	const paths = await site.sitePaths(base, site.fetchText);
	const results = await Promise.all(
		paths.map(async (p) => {
			const html = await site.fetchText(new URL(p.replace(/^\//, ""), base).href);
			return { path: p, read: html !== null, problems: html ? pm.pageProblems(html, config) : [] };
		}),
	);
	const read = results.filter((r) => r.read);
	const pages = read
		.filter((r) => r.problems.length)
		.map(({ path: p, problems }) => ({ path: p, problems }));
	events.emit({ type: "page-meta-check", base, checked: read.length, pages });
	logger.info(ui.heading(`page_meta on ${base}`));
	logger.info(`  ${read.length - pages.length} of ${read.length} pages match.`);
	for (const p of pages) logger.warn(`${p.path}: ${p.problems.join(", ")}`);
	if (pages.length) process.exitCode = 1;
}
