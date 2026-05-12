import chalk from "chalk";

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
