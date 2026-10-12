import chalk from "chalk";
import * as ui from "./ui.js";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	silent: 4,
};

function getLevel(): LogLevel {
	const env = process.env.EDS_LOG_LEVEL?.toLowerCase();
	if (env && env in LEVEL_ORDER) return env as LogLevel;
	return "info";
}

let currentLevel: LogLevel = getLevel();
let quiet = false;
let logoShown = false;

function shouldLog(level: LogLevel): boolean {
	if (quiet) return level === "error";
	return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

export const logger = {
	setLevel(level: LogLevel) {
		currentLevel = level;
	},
	setQuiet(q: boolean) {
		quiet = q;
	},

	debug(...args: unknown[]) {
		if (shouldLog("debug")) console.error(chalk.gray("[debug]"), ...args);
	},
	info(...args: unknown[]) {
		if (shouldLog("info")) console.error(...args);
	},
	/**
	 * Print the brand logo at most once per process. The interactive menu and
	 * every command call this, so running a command directly shows the logo,
	 * while picking it from the menu (which already showed it) doesn't repeat it.
	 */
	logoOnce(art: string) {
		if (logoShown) return;
		logoShown = true;
		if (shouldLog("info")) console.error(art);
	},

	/**
	 * Print the brand intro at most once — the EDS ASCII art plus a single static
	 * brand line. (Previously an animated dot sweep that redrew in place with
	 * `\r`; on narrow terminals the line wrapped and the redraw left a trail of
	 * duplicate frames, so the animation was dropped.) Kept async for call-site
	 * compatibility.
	 */
	async logoOnceAnimated(tagline: string) {
		if (logoShown) return;
		logoShown = true;
		if (!shouldLog("info")) return;
		console.error(ui.logo(tagline));
	},
	success(...args: unknown[]) {
		if (shouldLog("info")) console.error(chalk.green("✓"), ...args);
	},
	warn(...args: unknown[]) {
		if (shouldLog("warn")) console.error(chalk.yellow("⚠"), ...args);
	},
	error(...args: unknown[]) {
		if (shouldLog("error")) console.error(chalk.red("✗"), ...args);
	},
};
