import { Command } from "commander";
import { logger } from "../lib/logger.js";

const program = new Command();

program
	.name("eds")
	.description("CLI for AEM Edge Delivery Services with Figma integration")
	.version("0.1.0")
	.option("--verbose", "Enable verbose output")
	.option("--quiet", "Suppress non-error output")
	.option("--json", "Output in JSON format")
	.option("--no-color", "Disable color output")
	.hook("preAction", (thisCommand) => {
		const opts = thisCommand.opts();
		if (opts.verbose) logger.setLevel("debug");
		if (opts.quiet) logger.setQuiet(true);
	});

// eds block create <name>
const block = program.command("block").description("Manage EDS blocks");

block
	.command("create <name>")
	.description("Scaffold a new EDS block")
	.option("--with-ue-model", "Generate Universal Editor model file")
	.action(async (name: string, options) => {
		const { createBlock } = await import("../commands/block/create.js");
		await createBlock(name, options);
	});

// eds block from-figma <url>
block
	.command("from-figma <figma-url>")
	.description("Generate an EDS block from a Figma design")
	.option("--name <name>", "Override the inferred block name")
	.option("--agent <type>", "Force agent type (claude|cursor|codex|none)")
	.option("--dry-run", "Generate prompt only, do not invoke agent")
	.option("--with-ue-model", "Generate Universal Editor model file")
	.option("--yes", "Skip confirmation prompts")
	.action(async (figmaUrl: string, options) => {
		const { blockFromFigma } = await import("../commands/block/from-figma.js");
		await blockFromFigma(figmaUrl, options);
	});

// eds block list
block
	.command("list")
	.description("List all blocks in the project")
	.action(async (options) => {
		const { listBlocks } = await import("../commands/block/list.js");
		await listBlocks(options);
	});

// eds figma setup
const figma = program.command("figma").description("Figma MCP integration");

figma
	.command("setup")
	.description("Configure Figma MCP for your AI agent")
	.action(async () => {
		const { figmaSetup } = await import("../commands/figma/setup.js");
		await figmaSetup();
	});

// eds doctor
program
	.command("doctor")
	.description("Audit your EDS project for common issues")
	.action(async () => {
		const { doctor } = await import("../commands/doctor.js");
		await doctor();
	});

// eds audit loading
const audit = program.command("audit").description("Run project audits");

audit
	.command("loading")
	.description("Check loading order (eager/lazy/delayed phases, LCP budget)")
	.action(async () => {
		const { auditLoading } = await import("../commands/audit-loading.js");
		await auditLoading();
	});

// eds preview <path...>
program
	.command("preview <paths...>")
	.description("Preview pages via Admin API")
	.option("--org <org>", "GitHub org/owner")
	.option("--site <site>", "Repository name")
	.option("--ref <ref>", "Git ref (default: main)")
	.action(async (paths: string[], options) => {
		const { preview } = await import("../commands/preview.js");
		await preview(paths, options);
	});

// eds publish <path...>
program
	.command("publish <paths...>")
	.description("Publish pages to live via Admin API")
	.option("--org <org>", "GitHub org/owner")
	.option("--site <site>", "Repository name")
	.option("--ref <ref>", "Git ref (default: main)")
	.action(async (paths: string[], options) => {
		const { publish } = await import("../commands/publish.js");
		await publish(paths, options);
	});

program.parseAsync().catch((err) => {
	logger.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
