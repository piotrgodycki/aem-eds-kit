import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { INTEGRATIONS, integrationById, wrapBlock } from "../lib/integrations.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

const DELAYED_HEADER = `// delayed.js - third-party / non-critical scripts.
// Loaded in the EDS delayed phase (after LCP), so nothing here blocks the page.
`;

/**
 * `eds integrate [type]` - interactively add a third-party service (GTM, GA4,
 * chat facade, consent, custom) to scripts/delayed.js, the EDS-correct place
 * for non-critical third-party code.
 */
export async function integrate(type: string | undefined): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Integrate - third-party service"));

	const { select, input } = await import("@inquirer/prompts");

	const chosenId =
		type ||
		(await select({
			message: "Which service do you want to add?",
			choices: INTEGRATIONS.map((i) => ({ name: i.name, value: i.id })),
		}));

	const integration = integrationById(chosenId);
	if (!integration) {
		logger.error(
			`Unknown integration "${chosenId}". Options: ${INTEGRATIONS.map((i) => i.id).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	const values: Record<string, string> = {};
	for (const f of integration.fields) {
		const answer = await input({ message: `  ${f.message}`, default: f.placeholder });
		values[f.name] = answer.trim();
	}

	// Integrations with a dedicated module write that file and wire a loader
	// into delayed.js. Their snippet uses top-level `import`, so it's appended
	// raw (not wrapped in a block, where imports aren't allowed).
	const modulePaths: string[] = [];
	if (integration.module) {
		for (const mod of integration.module(values)) {
			const abs = path.join(projectRoot, mod.file);
			await mkdir(path.dirname(abs), { recursive: true });
			await writeFile(abs, mod.content);
			modulePaths.push(mod.file);
		}
	}

	const block = integration.module
		? `\n// ${integration.name} (eds integrate)\n${integration.code(values)}\n`
		: wrapBlock(integration.name, integration.code(values));

	const delayedPath = path.join(projectRoot, "scripts", "delayed.js");
	await mkdir(path.dirname(delayedPath), { recursive: true });
	const existing = existsSync(delayedPath) ? await readFile(delayedPath, "utf-8") : DELAYED_HEADER;
	await writeFile(delayedPath, `${existing.replace(/\s*$/, "")}\n${block}`);

	logger.info(ui.heading("Added"));
	for (const p of modulePaths) logger.info(ui.accentLine(integration.name, `wrote ${p}`));
	logger.info(ui.accentLine(integration.name, "wired into scripts/delayed.js"));
	logger.info("");
	logger.info(
		chalk.dim("  Loads after LCP (delayed phase) - zero impact on your Core Web Vitals."),
	);
	if (integration.id === "gtm" || integration.id === "ga4") {
		logger.info(
			chalk.dim("  Tip: gate analytics behind user consent (add the Cookiebot integration)."),
		);
	}
	if (integration.id === "chat") {
		logger.info(
			chalk.dim("  The widget loads only when the visitor clicks the button (facade pattern)."),
		);
	}
	logger.info("");
	logger.info(ui.box(["Integration added"]));
}
