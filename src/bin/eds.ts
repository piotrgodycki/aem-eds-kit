import chalk from "chalk";
import { Command } from "commander";
// Single source of truth for the version - inlined from package.json at build
// time, so `eds --version` can never drift from the published version.
import pkg from "../../package.json" with { type: "json" };
import { logger } from "../lib/logger.js";
import * as ui from "../lib/ui.js";

const program = new Command();

program
	.name("eds")
	.description("CLI for AEM Edge Delivery Services with Figma integration")
	.version(pkg.version)
	.option("--verbose", "Enable verbose output")
	.option("--quiet", "Suppress non-error output")
	.option("--json", "Output in JSON format")
	.option("--no-color", "Disable color output")
	.showHelpAfterError("(add --help for usage)")
	.hook("preAction", (thisCommand) => {
		const opts = thisCommand.opts();
		if (opts.verbose) logger.setLevel("debug");
		if (opts.quiet) logger.setQuiet(true);
		// `--no-color` yields `opts.color === false`; silence chalk entirely.
		if (opts.color === false) chalk.level = 0;
	});

// ANSI-art logo above every help screen (root and subcommands).
program.addHelpText("beforeAll", () => ui.logo());

// eds sandbox new|list|rm
const sandbox = program.command("sandbox").description("Disposable EDS sandbox repos on GitHub");
sandbox
	.command("new <name>")
	.description("Create a disposable EDS repo from a boilerplate (GitHub auth, no gh required)")
	.option("--org <org>", "Create under a GitHub org (else your account)")
	.option("--boilerplate <repo>", "Template repo (default adobe/aem-boilerplate)")
	.option("--ue", "Use the crosswalk / Universal Editor boilerplate")
	.option("--private", "Create a private repo")
	.option("--yes", "Skip the guided prompts (use flags/defaults)")
	.action(async (name: string, options) => {
		const { sandboxNew } = await import("../commands/sandbox.js");
		await sandboxNew(name, options);
	});
sandbox
	.command("login")
	.description("Authorize GitHub (OAuth device flow or a token) - no gh needed")
	.action(async () => {
		const { sandboxLogin } = await import("../commands/sandbox.js");
		await sandboxLogin();
	});
sandbox
	.command("logout")
	.description("Remove the stored GitHub token")
	.action(async () => {
		const { sandboxLogout } = await import("../commands/sandbox.js");
		await sandboxLogout();
	});
sandbox
	.command("list")
	.description("List your EDS sandboxes (repos tagged eds-sandbox)")
	.action(async () => {
		const { sandboxList } = await import("../commands/sandbox.js");
		await sandboxList();
	});
sandbox
	.command("rm <name>")
	.description("Delete a sandbox repo (destructive)")
	.option("--org <org>", "Owner org (else your account)")
	.option("--yes", "Skip the confirmation")
	.action(async (name: string, options) => {
		const { sandboxRm } = await import("../commands/sandbox.js");
		await sandboxRm(name, options);
	});

// eds template new <name>
const template = program
	.command("template")
	.description("Generate page templates / initial content");
template
	.command("new <name>")
	.description("Generate EDS page initial content (sections + blocks + metadata), DA push optional")
	.option("--path <path>", "Content path (default: /templates/<name>)")
	.option("--title <title>", "Page title")
	.option("--description <text>", "Page description")
	.option("--blocks <list>", "Comma-separated block ids to seed", (v) =>
		v.split(",").map((b) => b.trim()),
	)
	.option("--area <area>", "Site area / template label (stored in metadata)")
	.option("--authoring <model>", "Force authoring model: da | gdrive | sharepoint | ue")
	.option("--push", "Push the page to DA (da.live)")
	.option("--org <org>", "DA org (else from .edsrc.json)")
	.option("--site <site>", "DA site (else from .edsrc.json)")
	.option("--yes", "Skip prompts")
	.action(async (name: string, options) => {
		const { templateNew } = await import("../commands/template.js");
		await templateNew(name, options);
	});

// eds init
program
	.command("init")
	.description("Set up a freshly cloned EDS boilerplate for your authoring model (interactive)")
	.option("--name <name>", "Project name (kebab-case)")
	.option("--authoring <model>", "Authoring model: ue | da | gdrive | sharepoint")
	.option("--mountpoint <url>", "Content source URL (document models)")
	.option("--org <org>", "DA org (authoring=da)")
	.option("--site <site>", "DA site (authoring=da)")
	.option("--no-ci", "Skip the GitHub Actions CI workflow")
	.option("--yes", "Skip prompts; apply with flags/defaults")
	.action(async (options) => {
		const { initProject } = await import("../commands/init.js");
		await initProject(options);
	});

// eds migrate component <dir>
const migrate = program.command("migrate").description("Migrate from classic AEM to EDS");
migrate
	.command("component [dir]")
	.description("Migrate a classic AEM component's dialog into an EDS block + UE model")
	.option("--name <name>", "Block name (otherwise inferred from the component)")
	.option("--clientlib <dir>", "Path to the component's clientlib (otherwise auto-detected)")
	.option("--yes", "Skip confirmation prompts")
	.action(async (dir: string | undefined, options) => {
		const { migrateComponent } = await import("../commands/migrate.js");
		await migrateComponent(dir, options);
	});

// eds model add <block> [partials...]
const model = program.command("model").description("Compose Universal Editor models");
model
	.command("add <block> [partials...]")
	.description("Add reusable field groups (partials) to a block's UE model")
	.option("--yes", "Skip prompts")
	.action(async (blockName: string, partials: string[], options) => {
		const { modelAdd } = await import("../commands/model.js");
		await modelAdd(blockName, partials, options);
	});

// eds schema block <name>
const schema = program.command("schema").description("Structured data (JSON-LD) for blocks");
schema
	.command("block <name>")
	.description("Inject a JSON-LD (schema.org) builder into a block's decorate()")
	.option("--type <type>", "schema.org type (Article, FAQPage, Product, ...)")
	.option("--yes", "Skip prompts")
	.action(async (name: string, options) => {
		const { schemaBlock } = await import("../commands/schema.js");
		await schemaBlock(name, options);
	});

// eds track block <name>
const track = program.command("track").description("Instrument blocks for analytics");
track
	.command("block <name>")
	.description("Add dataLayer tracking (click + form submit) to a block's decorate()")
	.option("--no-click", "Skip click tracking")
	.option("--no-submit", "Skip form-submit tracking")
	.action(async (name: string, options) => {
		const { trackBlock } = await import("../commands/track.js");
		await trackBlock(name, options);
	});

// eds block create <name>
const block = program.command("block").description("Manage EDS blocks");

block
	.command("create <name>")
	.description("Scaffold a new EDS block (with Universal Editor model by default)")
	.option("--no-ue-model", "Skip the Universal Editor model (generated by default)")
	.action(async (name: string, options) => {
		const { createBlock } = await import("../commands/block/create.js");
		await createBlock(name, options);
	});

// eds block from-design <url>
block
	.command("from-design [design-url]")
	.description(
		"Generate an EDS block from a design (Figma/Stitch/Canva/Sketch; interactive wizard when run with no URL)",
	)
	.option("--name <name>", "Override the inferred block name")
	.option("--agent <type>", "Force agent type (claude|cursor|codex|none)")
	.option("--dry-run", "Generate prompt only, do not invoke agent")
	.option("--source <type>", "Content source: document|ue|cf|mixed (default: document)")
	.option("--no-ue-model", "Skip the Universal Editor model (generated by default)")
	.option("--no-screenshot", "Skip the screenshot fetch (fewer tokens; structural verification)")
	.option("--no-serve", "Don't auto-start the live preview after generating")
	.option("--yes", "Skip confirmation prompts")
	.action(async (designUrl: string | undefined, options) => {
		const { blockFromDesign } = await import("../commands/block/from-design.js");
		await blockFromDesign(designUrl, options);
	});

// eds block list
block
	.command("list")
	.description("List all blocks in the project")
	.action(async (options) => {
		const { listBlocks } = await import("../commands/block/list.js");
		await listBlocks({ ...options, json: program.opts().json });
	});

// eds block preview <name>
block
	.command("preview <name>")
	.description("Serve a live, breakpoint-switchable preview of a block in the browser")
	.option("--port <port>", "Port to serve on (default: 8777, falls back if taken)")
	.option("--widths <list>", "Comma-separated breakpoint widths (e.g. 375,768,1280)")
	.option("--no-open", "Do not open the browser automatically")
	.action(async (name: string, options) => {
		const { previewBlock } = await import("../commands/block/preview.js");
		await previewBlock(name, options);
	});

// eds scaffold ...
const scaffold = program
	.command("scaffold")
	.description("Scaffold standard UE components and blocks")
	.action(async () => {
		const { scaffoldInteractive } = await import("../commands/scaffold.js");
		await scaffoldInteractive();
	});

scaffold
	.command("ue")
	.description("Scaffold default-content UE components + a field-reference block (all 17 fields)")
	.action(async () => {
		const { scaffoldUe } = await import("../commands/scaffold.js");
		await scaffoldUe();
	});

scaffold
	.command("blocks [names...]")
	.description("Scaffold standard blocks (hero, cards, columns, accordion, embed) with UE models")
	.action(async (names: string[]) => {
		const { scaffoldBlocks } = await import("../commands/scaffold.js");
		await scaffoldBlocks(names);
	});

scaffold
	.command("ci")
	.description("Scaffold a GitHub Actions workflow (doctor + audits + project lint/build)")
	.action(async () => {
		const { scaffoldCi } = await import("../commands/scaffold.js");
		await scaffoldCi();
	});

scaffold
	.command("helpers [names...]")
	.description("Scaffold scripts/utils.js with chosen EDS helpers (interactive picker)")
	.action(async (names: string[]) => {
		const { scaffoldHelpers } = await import("../commands/scaffold.js");
		await scaffoldHelpers(names);
	});

// eds integrate [type]
program
	.command("integrate [type]")
	.description("Add a third-party service (GTM, GA4, chat, consent) to scripts/delayed.js")
	.action(async (type: string | undefined) => {
		const { integrate } = await import("../commands/integrate.js");
		await integrate(type);
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
		await doctor({ json: program.opts().json });
	});

// eds audit loading
const audit = program.command("audit").description("Run project audits");

audit
	.command("loading")
	.description("Check loading order (eager/lazy/delayed phases, LCP budget)")
	.action(async () => {
		const { auditLoading } = await import("../commands/audit-loading.js");
		await auditLoading({ json: program.opts().json });
	});

audit
	.command("security")
	.description(
		"Scan for vulnerabilities (npm audit) and exploit patterns (XSS, secrets, tabnabbing)",
	)
	.action(async () => {
		const { auditSecurity } = await import("../commands/audit-security.js");
		await auditSecurity({ json: program.opts().json });
	});

// eds preview [path...]  (interactive Admin API wizard when no paths)
program
	.command("preview [paths...]")
	.description("Preview pages via Admin API (interactive wizard when run with no paths)")
	.option("--org <org>", "GitHub org/owner")
	.option("--site <site>", "Repository name")
	.option("--ref <ref>", "Git ref (default: main)")
	.action(async (paths: string[], options) => {
		if (!paths || paths.length === 0) {
			const { adminWizard } = await import("../commands/admin.js");
			await adminWizard("preview");
			return;
		}
		const { preview } = await import("../commands/preview.js");
		await preview(paths, options);
	});

// eds publish [path...]  (interactive Admin API wizard when no paths)
program
	.command("publish [paths...]")
	.description("Publish pages to live via Admin API (interactive wizard when run with no paths)")
	.option("--org <org>", "GitHub org/owner")
	.option("--site <site>", "Repository name")
	.option("--ref <ref>", "Git ref (default: main)")
	.action(async (paths: string[], options) => {
		if (!paths || paths.length === 0) {
			const { adminWizard } = await import("../commands/admin.js");
			await adminWizard("publish");
			return;
		}
		const { publish } = await import("../commands/publish.js");
		await publish(paths, options);
	});

// No command → open the interactive menu in a terminal; fall back to help when
// piped / non-interactive (CI). Flags and subcommands always work directly.
(async () => {
	try {
		if (process.argv.slice(2).length === 0) {
			if (process.stdout.isTTY) {
				const { mainMenu } = await import("../commands/menu.js");
				await mainMenu();
			} else {
				program.outputHelp();
			}
		} else {
			await program.parseAsync();
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
	}
})();
