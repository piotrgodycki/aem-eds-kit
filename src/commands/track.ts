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
