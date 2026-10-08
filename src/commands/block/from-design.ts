import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { detectAgent, detectAllAgents } from "../../lib/agents/detect.js";
import { invokeAgent, savePromptToFile } from "../../lib/agents/invoke.js";
import { loadConfig } from "../../lib/config.js";
import { parseFigmaUrl } from "../../lib/figma/node-id.js";
import {
	type ContentSource,
	type DesignProvider,
	PROMPT_VERSION,
	PROVIDER_NAMES,
	buildPrompt,
} from "../../lib/figma/prompt-builder.js";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import { kebabCaseRegex } from "../../lib/schemas.js";
import * as ui from "../../lib/ui.js";
import type { AgentType, FigmaUrlParts } from "../../types/index.js";

interface FromDesignOptions {
	name?: string;
	agent?: string;
	dryRun?: boolean;
	/** Generate the Universal Editor model. Defaults to true (`--no-ue-model` disables). */
	ueModel?: boolean;
	yes?: boolean;
	/** Where the block's content comes from (default: document). */
	source?: ContentSource;
	/** Optional CF model / GraphQL persisted-query hint (cf/mixed). */
	cfHint?: string;
	/** Fetch a screenshot for pixel verification. Default true; `--no-screenshot` saves tokens. */
	screenshot?: boolean;
	/** Auto-start the preview after generating. Default true; `--no-serve` disables. */
	serve?: boolean;
	/** Design source. Defaults to figma. */
	provider?: DesignProvider;
}

/** Is an eds preview server already answering on this port? */
async function previewRunning(port = 8777): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 400);
		const res = await fetch(`http://127.0.0.1:${port}/__eds_ping`, { signal: ctrl.signal });
		clearTimeout(t);
		if (!res.ok) return false;
		const data = (await res.json()) as { eds?: boolean };
		return data?.eds === true;
	} catch {
		return false;
	}
}

/**
 * Interactive, step-by-step wizard used when `eds block from-design` is run
 * without a URL. Collects everything the flags would, including the content
 * source (document / UE / Content Fragment / mixed), then hands control back
 * to the normal flow. Returns null if the user cancels at the summary.
 */
async function runWizard(
	figmaUrl: string | undefined,
): Promise<(FromDesignOptions & { figmaUrl: string }) | null> {
	const { input, select, confirm } = await import("@inquirer/prompts");

	const provider = (await select({
		message: "1/7  Design source",
		choices: [
			{ name: "Figma", value: "figma" },
			{ name: "Google Stitch", value: "stitch" },
			{ name: "Canva", value: "canva" },
			{ name: "Sketch", value: "sketch" },
			{ name: "Framer", value: "framer" },
		],
		default: "figma",
	})) as DesignProvider;

	const name = await input({
		message: "2/7  Component name",
		validate: (v) => kebabCaseRegex.test(v.trim()) || "Use kebab-case, e.g. hero-banner",
	});

	const url =
		figmaUrl ??
		(await input({
			message: `3/7  ${PROVIDER_NAMES[provider]} link`,
			validate: (v) => {
				if (!v.trim()) return "Paste the design link";
				if (provider !== "figma") return true;
				try {
					parseFigmaUrl(v.trim());
					return true;
				} catch (err) {
					return (err as Error).message;
				}
			},
		}));

	const source = (await select({
		message: "4/7  Where does the content come from?",
		choices: [
			{ name: "Document authoring (default EDS)", value: "document" },
			{ name: "Universal Editor", value: "ue" },
			{ name: "Content Fragment", value: "cf" },
			{ name: "Mixed - Universal Editor + Content Fragment", value: "mixed" },
		],
		default: "document",
	})) as ContentSource;

	let cfHint: string | undefined;
	if (source === "cf" || source === "mixed") {
		const hint = await input({
			message: "     CF model / GraphQL persisted-query name (optional)",
		});
		cfHint = hint.trim() || undefined;
	}

	const ueModel = await confirm({
		message: "5/7  Generate the Universal Editor model?",
		default: true,
	});

	const screenshot = await confirm({
		message: "6/7  Fetch a screenshot for a pixel-perfect check? (off = fewer tokens)",
		default: true,
	});

	const agents = await detectAllAgents();
	const runMode = await select({
		message: "7/7  Run with",
		choices: [
			...agents.map((a) => ({
				name: `${a.type}${provider === "figma" && !a.hasFigmaMcp ? " (Figma MCP not detected)" : ""}`,
				value: `agent:${a.type}`,
			})),
			{ name: "Preview the prompt only (--dry-run)", value: "dry-run" },
			{ name: "Save the prompt, run it later (--agent none)", value: "none" },
		],
		default: agents[0] ? `agent:${agents[0].type}` : "dry-run",
	});

	const sourceLabel = PROVIDER_NAMES[provider].toLowerCase();
	logger.info(ui.heading("Summary"));
	const w = ui.columnWidth(["component", sourceLabel, "content", "ue model", "screenshot", "run"]);
	logger.info(ui.accentLine("component", name, w));
	const designRef =
		provider === "figma"
			? (() => {
					const parsed = parseFigmaUrl(url.trim());
					return parsed.nodeId ? `node ${parsed.nodeId}` : parsed.fileKey;
				})()
			: url.trim();
	logger.info(ui.accentLine(sourceLabel, designRef, w));
	logger.info(ui.accentLine("content", source + (cfHint ? ` (${cfHint})` : ""), w));
	logger.info(ui.accentLine("ue model", ueModel ? "yes" : "no", w));
	logger.info(ui.accentLine("screenshot", screenshot ? "yes" : "no (token-lean)", w));
	logger.info(ui.accentLine("run", runMode.replace("agent:", ""), w));
	logger.info("");

	const go = await confirm({ message: "Generate this block?", default: true });
	if (!go) return null;

	const opts: FromDesignOptions & { figmaUrl: string } = {
		figmaUrl: url.trim(),
		name,
		provider,
		source,
		cfHint,
		ueModel,
		screenshot,
	};
	if (runMode === "dry-run") opts.dryRun = true;
	else if (runMode === "none") opts.agent = "none";
	else {
		opts.agent = runMode.replace("agent:", "");
		opts.yes = true;
	}
	return opts;
}

function inferBlockName(fileName?: string): string {
	if (!fileName) return "design-block";
	return (
		fileName
			.replace(/[-_\s]+/g, "-")
			.replace(/[^a-z0-9-]/gi, "")
			.toLowerCase()
			.replace(/^-+|-+$/g, "") || "design-block"
	);
}

export async function blockFromDesign(
	figmaUrlArg: string | undefined,
	optionsArg: FromDesignOptions,
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error(
			"Not inside an EDS project (no EDS project markers found). Run this from your project root.",
		);
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Design → EDS block");

	let designUrl = figmaUrlArg;
	let options = optionsArg;
	// No URL given → run the interactive, step-by-step wizard.
	if (!designUrl) {
		const wiz = await runWizard(designUrl);
		if (!wiz) {
			logger.info("Cancelled.");
			return;
		}
		designUrl = wiz.figmaUrl;
		options = { ...options, ...wiz };
	}

	const provider = options.provider ?? "figma";
	const providerName = PROVIDER_NAMES[provider];

	// Resolve the design reference. Figma links are parsed into file/node parts
	// (which feed the Figma MCP tools); every other provider passes its raw link
	// through as a reference the agent reads via that provider's own MCP.
	let figma: FigmaUrlParts | null = null;
	const designRef = designUrl;
	if (provider === "figma") {
		const spinner = ora("Parsing Figma URL...").start();
		try {
			figma = parseFigmaUrl(designUrl);
			spinner.succeed(
				`Parsed Figma URL  ${chalk.dim(figma.nodeId ? `node ${figma.nodeId}` : `file ${figma.fileKey}`)}`,
			);
		} catch (err) {
			spinner.fail((err as Error).message);
			process.exitCode = 1;
			return;
		}
	} else {
		logger.info(`  ${ui.icon.pass} ${providerName} design  ${chalk.dim(designRef)}`);
	}

	// Determine block name. Non-Figma providers can't infer one from a file name,
	// so a name is required there.
	const blockName = options.name || (figma ? inferBlockName(figma.fileName) : "");
	if (!kebabCaseRegex.test(blockName)) {
		logger.error(
			`Invalid block name "${blockName}". Use --name with a kebab-case name (e.g., --name hero-banner).`,
		);
		process.exitCode = 1;
		return;
	}

	// Build prompt (reads project design tokens from styles/styles.css)
	const promptSpinner = ora("Reading design tokens & building prompt...").start();
	const prompt = await buildPrompt({
		provider,
		figma,
		designRef,
		blockName,
		projectRoot,
		withUeModel: options.ueModel !== false,
		contentSource: options.source ?? "document",
		cfHint: options.cfHint,
		screenshot: options.screenshot !== false,
	});
	const promptFile = await savePromptToFile(prompt, projectRoot);
	const hasTokens = existsSync(path.join(projectRoot, "styles", "styles.css"));
	promptSpinner.succeed(
		hasTokens
			? `Loaded design tokens  ${chalk.dim("styles/styles.css")}`
			: `Built prompt  ${chalk.dim("no project tokens found")}`,
	);
	logger.info(chalk.dim(`  prompt → ${promptFile}`));

	// Dry run — stop here
	if (options.dryRun) {
		logger.info("");
		logger.info(chalk.yellow("Dry run mode — prompt generated but agent not invoked."));
		logger.info(`Prompt file: ${chalk.cyan(promptFile)}`);
		logger.info(`Block name:  ${chalk.cyan(blockName)}`);
		logger.info(`Prompt version: ${PROMPT_VERSION}`);
		logger.info("");
		logger.info("Preview:");
		logger.info(chalk.dim("─".repeat(60)));
		console.log(prompt);
		return;
	}

	// Detect agent
	const config = await loadConfig(projectRoot);
	const preferredAgent = (options.agent as AgentType) || config.agent;

	if (options.agent === "none") {
		logger.info("Agent skipped (--agent none). Use the prompt file manually:");
		logger.info(`  ${chalk.cyan(promptFile)}`);
		return;
	}

	const agentSpinner = ora("Detecting AI agent...").start();
	const agent = await detectAgent(preferredAgent);

	if (!agent) {
		agentSpinner.fail("No AI agent found (claude, cursor, or codex).");
		logger.info(`Install Claude Code: ${chalk.cyan("npm install -g @anthropic-ai/claude-code")}`);
		logger.info(`Or use the prompt file manually: ${chalk.cyan(promptFile)}`);
		process.exitCode = 1;
		return;
	}

	agentSpinner.succeed(`Agent ready  ${chalk.cyan(agent.type)}  ${chalk.dim(agent.path)}`);

	if (provider === "figma" && !agent.hasFigmaMcp) {
		logger.warn(`Figma MCP may not be configured for ${agent.type}.`);
		logger.info(`Run ${chalk.cyan("eds figma setup")} to configure it.`);
	}

	// Confirm with user unless --yes
	if (!options.yes) {
		const { confirm } = await import("@inquirer/prompts");
		const proceed = await confirm({
			message: `Run ${agent.type} with the generated prompt?`,
			default: true,
		});
		if (!proceed) {
			logger.info(`Prompt saved to: ${chalk.cyan(promptFile)}`);
			return;
		}
	}

	// Hand off to the agent (mirrors the flow shown on the landing page).
	logger.info(
		`  ${chalk.dim("→")} Handing off to ${chalk.cyan(agent.type)}  ${chalk.dim(`via ${providerName} MCP`)}`,
	);
	if (provider === "figma") {
		logger.info(chalk.dim("     get_design_context · get_variable_defs · get_screenshot"));
	}

	// Invoke agent
	const success = await invokeAgent(agent, promptFile, projectRoot);

	if (!success) {
		process.exitCode = 1;
		return;
	}

	// Verify what the agent actually produced before declaring success.
	const blockDir = path.join(projectRoot, "blocks", blockName);
	const ok = await verifyGeneratedBlock(blockDir, blockName, options.ueModel !== false);

	// Post-process: save .eds-meta.json
	if (existsSync(blockDir)) {
		const meta = {
			provider,
			designRef,
			figmaFileKey: figma?.fileKey ?? null,
			figmaNodeId: figma?.nodeId ?? null,
			lastSyncedAt: new Date().toISOString(),
			promptVersion: PROMPT_VERSION,
			agentUsed: agent.type,
		};
		await writeFile(path.join(blockDir, ".eds-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
	}

	if (!ok) {
		logger.warn(
			`Block "${blockName}" generated with issues — review the output above before publishing.`,
		);
		process.exitCode = 1;
		return;
	}
	logger.success(`Block "${blockName}" generation complete.`);

	// Optionally instrument the block for analytics (dataLayer) - interactive only.
	if (!options.yes) {
		const { confirm } = await import("@inquirer/prompts");
		const addTracking = await confirm({
			message: "Instrument this block for analytics (dataLayer)?",
			default: false,
		});
		if (addTracking) {
			const { trackBlock } = await import("../track.js");
			await trackBlock(blockName, {});
		}
	}

	// Auto-start the live preview. If one is already running, leave it — its
	// file watcher refreshes the browser when the generated files change.
	if (options.serve !== false) {
		if (await previewRunning()) {
			logger.info(
				chalk.dim(
					"  A preview server is already running at http://127.0.0.1:8777 — your change will refresh there.",
				),
			);
		} else {
			logger.info("");
			const { previewBlock } = await import("./preview.js");
			await previewBlock(blockName, {});
		}
	} else {
		logger.info(`  ${chalk.dim("→")} Next:  ${chalk.cyan(`eds block preview ${blockName}`)}`);
	}
}

/**
 * Sanity-check the files the agent wrote: core files present, JS exports a
 * decorator, CSS is scoped to the block, no stray debug logging. Prints an
 * aligned report and returns false if any hard check fails.
 */
async function verifyGeneratedBlock(
	blockDir: string,
	blockName: string,
	withUeModel: boolean,
): Promise<boolean> {
	const checks: { status: ui.Status; name: string; message: string }[] = [];
	const jsPath = path.join(blockDir, `${blockName}.js`);
	const cssPath = path.join(blockDir, `${blockName}.css`);

	const hasJs = existsSync(jsPath);
	const hasCss = existsSync(cssPath);
	checks.push({
		status: hasJs ? "pass" : "fail",
		name: `${blockName}.js`,
		message: hasJs ? "created" : "missing — agent did not write the JS file",
	});
	checks.push({
		status: hasCss ? "pass" : "fail",
		name: `${blockName}.css`,
		message: hasCss ? "created" : "missing — agent did not write the CSS file",
	});

	if (hasJs) {
		const js = await readFile(jsPath, "utf-8");
		checks.push({
			status: /export\s+default/.test(js) ? "pass" : "fail",
			name: "decorate export",
			message: /export\s+default/.test(js) ? "found" : "no default export — block won't load",
		});
		if (js.includes("console.log")) {
			checks.push({
				status: "warn",
				name: "no console.log",
				message: "found console.log — remove before production",
			});
		}
	}

	if (hasCss) {
		const css = await readFile(cssPath, "utf-8");
		checks.push({
			status: css.includes(`.${blockName}`) ? "pass" : "warn",
			name: "scoped CSS",
			message: css.includes(`.${blockName}`)
				? `scoped to .${blockName}`
				: `no .${blockName} selector — styles may leak`,
		});
	}

	if (withUeModel) {
		const hasPerBlock = existsSync(path.join(blockDir, `_${blockName}.json`));
		// Accept an aggregated model file that references this block, too.
		const modelsFile = path.join(blockDir, "..", "..", "component-models.json");
		let hasAggregated = false;
		if (!hasPerBlock && existsSync(modelsFile)) {
			try {
				hasAggregated = (await readFile(modelsFile, "utf-8")).includes(`"${blockName}"`);
			} catch {
				// ignore
			}
		}
		const hasModel = hasPerBlock || hasAggregated;
		checks.push({
			status: hasModel ? "pass" : "warn",
			name: "Universal Editor model",
			message: hasModel
				? hasPerBlock
					? `_${blockName}.json created`
					: "added to component-models.json"
				: `missing — no _${blockName}.json (run with default UE generation, or --no-ue-model to skip)`,
		});

		// Multifield guardrail: a repeatable (container) model whose decorate()
		// doesn't iterate block.children will only ever render one item.
		if (hasPerBlock && hasJs) {
			try {
				const modelRaw = await readFile(path.join(blockDir, `_${blockName}.json`), "utf-8");
				const js = await readFile(jsPath, "utf-8");
				const isRepeatable =
					/"resourceType"\s*:\s*"[^"]*\/item"/.test(modelRaw) ||
					/"filter"\s*:/.test(modelRaw) ||
					/"multi"\s*:\s*true/.test(modelRaw);
				const iterates =
					/\.children/.test(js) || /\bfor\s*\(/.test(js) || /\.forEach\s*\(/.test(js);
				if (isRepeatable) {
					checks.push({
						status: iterates ? "pass" : "warn",
						name: "multifield wired",
						message: iterates
							? "decorate() iterates items"
							: "repeatable model but decorate() never iterates block.children — only one item will render",
					});
				}
			} catch {
				// ignore
			}
		}
	}

	logger.info(ui.heading("Verification"));
	const nameWidth = ui.columnWidth(checks.map((c) => c.name));
	for (const c of checks) {
		logger.info(ui.statusLine(c.status, c.name, c.message, nameWidth));
	}
	logger.info("");

	return !checks.some((c) => c.status === "fail");
}
