import chalk from "chalk";
import ora from "ora";
import { previewPage, previewPages } from "../lib/admin-api.js";
import { findProjectRoot } from "../lib/project.js";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

interface PreviewOptions {
	org?: string;
	site?: string;
	ref?: string;
}

export async function preview(paths: string[], options: PreviewOptions): Promise<void> {
	const projectRoot = findProjectRoot();
	const config = await loadConfig(projectRoot);
	const adminConfig = resolveAdminConfig(config, options);

	if (!adminConfig) return;

	const spinner = ora(`Previewing ${paths.length} path(s)...`).start();

	const results = paths.length === 1
		? [await previewPage(adminConfig, paths[0])]
		: await previewPages(adminConfig, paths);

	spinner.stop();

	let hasErrors = false;
	for (const r of results) {
		if (r.ok) {
			logger.success(`${r.path} → ${chalk.cyan(r.previewUrl || "preview updated")}`);
		} else {
			logger.error(`${r.path} — ${r.message}`);
			hasErrors = true;
		}
	}

	if (hasErrors) process.exitCode = 1;
}

function resolveAdminConfig(
	config: { admin?: { org?: string; site?: string; ref?: string } },
	options: PreviewOptions,
) {
	const org = options.org || config.admin?.org;
	const site = options.site || config.admin?.site;
	const ref = options.ref || config.admin?.ref || "main";

	if (!org || !site) {
		logger.error("Missing --org and --site. Set them via flags or in .edsrc.json:");
		logger.info(
			chalk.dim('  { "admin": { "org": "my-org", "site": "my-site" } }'),
		);
		process.exitCode = 1;
		return undefined;
	}

	return { org, site, ref };
}

// Re-export for publish to reuse
export { resolveAdminConfig };
