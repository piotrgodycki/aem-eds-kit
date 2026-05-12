import chalk from "chalk";
import ora from "ora";
import { publishPage, publishPages } from "../lib/admin-api.js";
import { findProjectRoot } from "../lib/project.js";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { resolveAdminConfig } from "./preview.js";

interface PublishOptions {
	org?: string;
	site?: string;
	ref?: string;
}

export async function publish(paths: string[], options: PublishOptions): Promise<void> {
	const projectRoot = findProjectRoot();
	const config = await loadConfig(projectRoot);
	const adminConfig = resolveAdminConfig(config, options);

	if (!adminConfig) return;

	const spinner = ora(`Publishing ${paths.length} path(s)...`).start();

	const results = paths.length === 1
		? [await publishPage(adminConfig, paths[0])]
		: await publishPages(adminConfig, paths);

	spinner.stop();

	let hasErrors = false;
	for (const r of results) {
		if (r.ok) {
			logger.success(`${r.path} → ${chalk.cyan(r.liveUrl || "published")}`);
		} else {
			logger.error(`${r.path} — ${r.message}`);
			hasErrors = true;
		}
	}

	if (hasErrors) process.exitCode = 1;
}
