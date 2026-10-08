import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { kebabCaseRegex } from "../lib/schemas.js";

async function listBlockNames(projectRoot: string): Promise<string[]> {
	const dir = path.join(projectRoot, "blocks");
	if (!existsSync(dir)) return [];
	const entries = await readdir(dir, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * The interactive front door: `eds` with no command opens this menu and routes
 * to each feature's own wizard. Flags/subcommands still work for power users/CI.
 */
export async function mainMenu(): Promise<void> {
	const { select, input } = await import("@inquirer/prompts");

	await logger.logoOnceAnimated("What do you want to do?");

	const action = await select({
		message: "Choose an action",
		choices: [
			{ name: "Set up this project (authoring model, CI, naming)", value: "init" },
			{ name: "Generate a page template (initial content)", value: "template" },
			{ name: "Create a disposable sandbox repo on GitHub", value: "sandbox" },
			{
				name: "Generate a block from a design (Figma/Stitch/Canva/Sketch/Framer)",
				value: "from-design",
			},
			{ name: "Migrate a classic AEM component to EDS", value: "migrate" },
			{ name: "Scaffold Universal Editor components", value: "scaffold" },
			{ name: "Create an empty block", value: "create" },
			{ name: "Add a third-party integration (GTM, chat, consent…)", value: "integrate" },
			{ name: "Add fields to a block model (partials)", value: "model" },
			{ name: "Instrument a block for analytics (dataLayer)", value: "track" },
			{ name: "Add JSON-LD structured data to a block", value: "schema" },
			{ name: "Preview a block in the browser", value: "preview-block" },
			{ name: "Preview / publish pages (Admin API)", value: "admin" },
			{ name: "Audit the project", value: "audit" },
			{ name: "Configure Figma MCP", value: "figma-setup" },
		],
	});

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
