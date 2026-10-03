import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { detectAgent } from "../../lib/agents/detect.js";
import { invokeAgent, savePromptToFile } from "../../lib/agents/invoke.js";
import { loadConfig } from "../../lib/config.js";
import { parseFigmaUrl } from "../../lib/figma/node-id.js";
import { PROMPT_VERSION, buildPrompt } from "../../lib/figma/prompt-builder.js";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import { kebabCaseRegex } from "../../lib/schemas.js";
import * as ui from "../../lib/ui.js";
import type { AgentType, FigmaUrlParts } from "../../types/index.js";

interface FromFigmaOptions {
	name?: string;
	agent?: string;
	dryRun?: boolean;
	withUeModel?: boolean;
	yes?: boolean;
}

function inferBlockName(fileName?: string): string {
	if (!fileName) return "figma-block";
	return (
		fileName
			.replace(/[-_\s]+/g, "-")
			.replace(/[^a-z0-9-]/gi, "")
			.toLowerCase()
			.replace(/^-+|-+$/g, "") || "figma-block"
	);
}

export async function blockFromFigma(figmaUrl: string, options: FromFigmaOptions): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error(
			"Not inside an EDS project (no fstab.yaml found). Run this from your project root.",
		);
		process.exitCode = 1;
		return;
	}

	logger.info(ui.logo("Figma → EDS block"));

	// Parse Figma URL
	const spinner = ora("Parsing Figma URL...").start();
	let figma: FigmaUrlParts;
	try {
		figma = parseFigmaUrl(figmaUrl);
		spinner.succeed(
			`File: ${chalk.cyan(figma.fileKey)}${figma.nodeId ? `, node: ${chalk.cyan(figma.nodeId)}` : ""}`,
		);
	} catch (err) {
		spinner.fail((err as Error).message);
		process.exitCode = 1;
		return;
	}

	// Determine block name
	const blockName = options.name || inferBlockName(figma.fileName);
	if (!kebabCaseRegex.test(blockName)) {
		logger.error(
			`Invalid block name "${blockName}". Use --name with a kebab-case name (e.g., --name hero-banner).`,
		);
		process.exitCode = 1;
		return;
	}

	// Build prompt
	const promptSpinner = ora("Building prompt...").start();
	const prompt = await buildPrompt({
		figma,
		blockName,
		projectRoot,
		withUeModel: options.withUeModel ?? false,
	});
	const promptFile = await savePromptToFile(prompt);
	promptSpinner.succeed(`Prompt saved to ${chalk.cyan(promptFile)}`);

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

	agentSpinner.succeed(`Found ${chalk.cyan(agent.type)} at ${agent.path}`);

	if (!agent.hasFigmaMcp) {
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

	// Invoke agent
	const success = await invokeAgent(agent, promptFile, projectRoot);

	if (!success) {
		process.exitCode = 1;
		return;
	}

	// Verify what the agent actually produced before declaring success.
	const blockDir = path.join(projectRoot, "blocks", blockName);
	const ok = await verifyGeneratedBlock(blockDir, blockName, options.withUeModel ?? false);

	// Post-process: save .eds-meta.json
	if (existsSync(blockDir)) {
		const meta = {
			figmaFileKey: figma.fileKey,
			figmaNodeId: figma.nodeId || null,
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
		const modelPath = path.join(blockDir, `_${blockName}.json`);
		const hasModel = existsSync(modelPath);
		checks.push({
			status: hasModel ? "pass" : "warn",
			name: `_${blockName}.json`,
			message: hasModel ? "created" : "missing — requested --with-ue-model but no model written",
		});
	}

	logger.info(ui.heading("Verification"));
	const nameWidth = ui.columnWidth(checks.map((c) => c.name));
	for (const c of checks) {
		logger.info(ui.statusLine(c.status, c.name, c.message, nameWidth));
	}
	logger.info("");

	return !checks.some((c) => c.status === "fail");
}
