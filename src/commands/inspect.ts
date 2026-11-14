import chalk from "chalk";
import { events } from "../lib/events.js";
import { type Found, inspectProject } from "../lib/inventory.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

/** `eds inspect`: what the project already has, as a report (and an `inventory` event with --json). */
export async function inspect(): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const inv = await inspectProject(root);
	events.emit({ type: "inventory", inventory: inv });

	logger.info(ui.heading("Project", root));
	logger.info(
		ui.accentLine(
			"Kind",
			inv.kind === "universal-editor" ? "Universal Editor (crosswalk)" : "document-based",
			12,
		),
	);
	logger.info(
		ui.accentLine(
			"Content",
			inv.content ? `${inv.content.source} ${chalk.dim(inv.content.url ?? "")}` : "no fstab.yaml",
			12,
		),
	);

	logger.info(ui.heading("Blocks", `${inv.blocks.length} in blocks/`));
	for (const b of inv.blocks) {
		const has = [
			b.js && "js",
			b.css && "css",
			b.model && "UE model",
			b.preview && "preview",
		].filter(Boolean);
		logger.info(ui.accentLine(b.name, chalk.dim(has.join(" · ")), 20));
	}
	if (inv.kind === "universal-editor")
		logger.info(
			chalk.dim(
				`  UE: ${inv.components.definitions} components, ${inv.components.models} models, ${inv.components.filters} filters`,
			),
		);

	const section = (title: string, list: Found[]) => {
		if (!list.length) return;
		logger.info(ui.heading(title, String(list.length)));
		for (const f of list) logger.info(ui.accentLine(f.name, chalk.dim(f.files.join(", ")), 34));
	};
	section("Third parties", inv.thirdParties);
	section("Data layer", inv.analytics.dataLayer);
	section("Tag IDs", inv.analytics.ids);
	section("Page metadata read", inv.analytics.metadata);
	section("Custom events", inv.analytics.events);
	section("RUM checkpoints", inv.analytics.rum);
	section("Setup", inv.setup);

	logger.info(ui.heading("Styles"));
	logger.info(ui.accentLine("Tokens", `${inv.styles.tokens} custom properties in styles.css`, 12));
	if (inv.styles.fonts.length) logger.info(ui.accentLine("Fonts", inv.styles.fonts.join(", "), 12));
	if (inv.icons) logger.info(ui.accentLine("Icons", `${inv.icons} in icons/`, 12));
}
