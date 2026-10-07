import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

/**
 * Interactive wizard for the AEM Admin API (preview / publish). Reached from the
 * main menu or by running `eds preview` / `eds publish` with no paths. Defaults
 * come from `.edsrc.json` (`admin.org/site/ref`).
 */
export async function adminWizard(initialOp?: "preview" | "publish"): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Admin API — preview / publish"));

	const { select, input, confirm } = await import("@inquirer/prompts");
	const config = await loadConfig(projectRoot);
	const admin = (config as { admin?: { org?: string; site?: string; ref?: string } }).admin ?? {};

	const op =
		initialOp ??
		((await select({
			message: "What do you want to do?",
			choices: [
				{ name: "Preview pages (staging)", value: "preview" },
				{ name: "Publish pages (go live)", value: "publish" },
			],
		})) as "preview" | "publish");

	const org = (await input({ message: "GitHub org / owner", default: admin.org })).trim();
	const site = (await input({ message: "Repository / site", default: admin.site })).trim();
	const ref = (await input({ message: "Git ref", default: admin.ref || "main" })).trim();
	const pathsRaw = await input({
		message: "Paths (space- or comma-separated)",
		default: "/",
	});
	const paths = pathsRaw.split(/[\s,]+/).filter(Boolean);

	if (!org || !site || paths.length === 0) {
		logger.error("org, site and at least one path are required.");
		process.exitCode = 1;
		return;
	}

	logger.info(ui.heading("Summary"));
	const w = ui.columnWidth(["operation", "org", "site", "ref", "paths"]);
	logger.info(ui.accentLine("operation", op, w));
	logger.info(ui.accentLine("org", org, w));
	logger.info(ui.accentLine("site", site, w));
	logger.info(ui.accentLine("ref", ref, w));
	logger.info(ui.accentLine("paths", paths.join(", "), w));
	logger.info("");

	if (op === "publish") {
		const go = await confirm({
			message: `Publish ${paths.length} path(s) to LIVE?`,
			default: false,
		});
		if (!go) {
			logger.info("Cancelled.");
			return;
		}
	}

	const options = { org, site, ref };
	if (op === "preview") {
		const { preview } = await import("./preview.js");
		await preview(paths, options);
	} else {
		const { publish } = await import("./publish.js");
		await publish(paths, options);
	}
}
