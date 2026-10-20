import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { kebabCaseRegex } from "../lib/schemas.js";
import { session } from "../lib/session.js";

async function listBlockNames(projectRoot: string): Promise<string[]> {
	const dir = path.join(projectRoot, "blocks");
	if (!existsSync(dir)) return [];
	const entries = await readdir(dir, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Menu entries; the last one quits. */
const CHOICES = [
	{ name: "Set up project", value: "init", description: "Authoring model, CI, naming" },
	{ name: "Page template", value: "template", description: "Generate initial content" },
	{ name: "Sandbox repo", value: "sandbox", description: "Disposable GitHub repo" },
	{
		name: "Block from design",
		value: "from-design",
		description: "Figma, Framer or Google Stitch",
	},
	{ name: "Migrate component", value: "migrate", description: "Classic AEM component → EDS" },
	{ name: "Scaffold UE", value: "scaffold", description: "Universal Editor components" },
	{ name: "Empty block", value: "create", description: "Create a bare block" },
	{ name: "Integration", value: "integrate", description: "GTM, chat, consent…" },
	{
		name: "Model fields",
		value: "model",
		description: "Add fields to a block model (partials)",
	},
	{ name: "Analytics", value: "track", description: "Instrument a block (dataLayer)" },
	{ name: "Structured data", value: "schema", description: "Add JSON-LD to a block" },
	{ name: "Universal Editor", value: "ue", description: "Check readiness / open the editor" },
	{ name: "Preview block", value: "preview-block", description: "Live preview in the browser" },
	{ name: "Pages", value: "admin", description: "Preview / publish (Admin API)" },
	{ name: "Audit", value: "audit", description: "Doctor / loading / security" },
	{ name: "Figma MCP", value: "figma-setup", description: "Configure the connection" },
	{ name: "Exit", value: "exit", description: "Quit eds (or press Esc)" },
];

/**
 * The interactive front door: `eds` with no command opens this menu and routes
 * to each feature's own wizard. It stays open: after an action finishes (or
 * fails) you're back here. Arrows move, Enter runs, Esc goes back from a
 * sub-prompt and quits from the menu itself; Ctrl+C quits anywhere.
 * Flags/subcommands still run once and exit, for power users / CI.
 */
export async function mainMenu(): Promise<void> {
	const { select, isEscape, isExit } = await import("../lib/prompts.js");
	session.menu = true;
	await logger.logoOnceAnimated("");

	let last: string | undefined;
	for (;;) {
		logger.info(chalk.dim("  Esc quits here · goes back to this menu from any step"));
		let action: string;
		try {
			action = await select({ message: "Choose an action", choices: CHOICES, default: last });
		} catch (err) {
			if (isEscape(err) || isExit(err)) return;
			throw err;
		}
		if (action === "exit") return;
		last = action;

		try {
			await runAction(action);
		} catch (err) {
			if (isExit(err)) return; // Ctrl+C inside an action quits
			if (!isEscape(err)) logger.error(err instanceof Error ? err.message : String(err));
		}
		// An action's failure is reported where it happened; the session goes on.
		process.exitCode = undefined;
		logger.info("");
	}
}

/** Run one menu action (its own wizard / prompts). */
async function runAction(action: string): Promise<void> {
	const { select, input } = await import("../lib/prompts.js");
	switch (action) {
		case "init": {
			const { initProject } = await import("./init.js");
			await initProject({});
			return;
		}
		case "template": {
			const name = await input({
				message: "Template name",
				validate: (v) => !!v.trim() || "Required",
			});
			const { templateNew } = await import("./template.js");
			await templateNew(name.trim(), {});
			return;
		}
		case "sandbox": {
			const name = await input({
				message: "Sandbox repo name",
				validate: (v) => /^[a-z0-9][a-z0-9._-]*$/i.test(v.trim()) || "Use a valid repo name",
			});
			const { sandboxNew } = await import("./sandbox.js");
			await sandboxNew(name.trim(), {});
			return;
		}
		case "from-design": {
			const { blockFromDesign } = await import("./block/from-design.js");
			await blockFromDesign(undefined, {});
			return;
		}
		case "migrate": {
			const { migrateComponent } = await import("./migrate.js");
			await migrateComponent(undefined, {});
			return;
		}
		case "scaffold": {
			const { scaffoldInteractive } = await import("./scaffold.js");
			await scaffoldInteractive();
			return;
		}
		case "create": {
			const name = await input({
				message: "Block name",
				validate: (v) => kebabCaseRegex.test(v.trim()) || "Use kebab-case, e.g. hero-banner",
			});
			const { createBlock } = await import("./block/create.js");
			await createBlock(name.trim(), {});
			return;
		}
		case "integrate": {
			const { integrate } = await import("./integrate.js");
			await integrate(undefined);
			return;
		}
		case "preview-block": {
			const projectRoot = findProjectRoot();
			if (!projectRoot) {
				logger.error("Not inside an EDS project (no EDS project markers found).");
				return;
			}
			const blocks = await listBlockNames(projectRoot);
			if (blocks.length === 0) {
				logger.warn("No blocks found in blocks/.");
				return;
			}
			const name = await select({
				message: "Which block?",
				choices: blocks.map((b) => ({ name: b, value: b })),
			});
			const { previewBlock } = await import("./block/preview.js");
			await previewBlock(name, {});
			return;
		}
		case "model": {
			const { modelAdd } = await import("./model.js");
			await modelAdd(undefined, [], {});
			return;
		}
		case "track": {
			const projectRoot = findProjectRoot();
			if (!projectRoot) {
				logger.error("Not inside an EDS project (no EDS project markers found).");
				return;
			}
			const blocks = await listBlockNames(projectRoot);
			if (blocks.length === 0) {
				logger.warn("No blocks found in blocks/.");
				return;
			}
			const name = await select({
				message: "Which block to instrument?",
				choices: blocks.map((b) => ({ name: b, value: b })),
			});
			const { trackBlock } = await import("./track.js");
			await trackBlock(name, {});
			return;
		}
		case "schema": {
			const projectRoot = findProjectRoot();
			if (!projectRoot) {
				logger.error("Not inside an EDS project (no EDS project markers found).");
				return;
			}
			const blocks = await listBlockNames(projectRoot);
			if (blocks.length === 0) {
				logger.warn("No blocks found in blocks/.");
				return;
			}
			const name = await select({
				message: "Which block?",
				choices: blocks.map((b) => ({ name: b, value: b })),
			});
			const { schemaBlock } = await import("./schema.js");
			await schemaBlock(name, {});
			return;
		}
		case "ue": {
			const which = await select({
				message: "Universal Editor:",
				choices: [
					{ name: "Check readiness (which blocks are editable)", value: "check" },
					{ name: "Open a page in the editor", value: "open" },
				],
			});
			if (which === "check") {
				const { ueCheck } = await import("./ue.js");
				await ueCheck();
			} else {
				const pagePath = await input({ message: "Page path", default: "/" });
				const { ueOpen } = await import("./ue.js");
				await ueOpen(pagePath.trim() || "/", {});
			}
			return;
		}
		case "admin": {
			const { adminWizard } = await import("./admin.js");
			await adminWizard();
			return;
		}
		case "audit": {
			const which = await select({
				message: "Which audit?",
				choices: [
					{ name: "Doctor — overall project health", value: "doctor" },
					{ name: "Loading — three-phase / LCP budget", value: "loading" },
					{ name: "Security — vulnerabilities & exploit patterns", value: "security" },
				],
			});
			if (which === "doctor") {
				const { doctor } = await import("./doctor.js");
				await doctor({});
			} else if (which === "loading") {
				const { auditLoading } = await import("./audit-loading.js");
				await auditLoading({});
			} else {
				const { auditSecurity } = await import("./audit-security.js");
				await auditSecurity({});
			}
			return;
		}
		case "figma-setup": {
			const { figmaSetup } = await import("./figma/setup.js");
			await figmaSetup();
			return;
		}
	}
}
