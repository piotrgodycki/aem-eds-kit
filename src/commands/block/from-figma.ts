import chalk from "chalk";
import ora from "ora";
import { parseFigmaUrl } from "../../lib/figma/node-id.js";
import { buildPrompt, PROMPT_VERSION } from "../../lib/figma/prompt-builder.js";
import { detectAgent } from "../../lib/agents/detect.js";
import { savePromptToFile, invokeAgent } from "../../lib/agents/invoke.js";
import { findProjectRoot } from "../../lib/project.js";
import { loadConfig } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { kebabCaseRegex } from "../../lib/schemas.js";
import type { AgentType } from "../../types/index.js";

interface FromFigmaOptions {
	name?: string;
	agent?: string;
	dryRun?: boolean;
	withUeModel?: boolean;
	yes?: boolean;
}

function inferBlockName(fileName?: string): string {
	if (!fileName) return "figma-block";
	return fileName
		.replace(/[-_\s]+/g, "-")
		.replace(/[^a-z0-9-]/gi, "")
		.toLowerCase()
		.replace(/^-+|-+$/g, "")
		|| "figma-block";
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

	// Parse Figma URL
	const spinner = ora("Parsing Figma URL...").start();
	let figma;
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
	await invokeAgent(agent, promptFile, projectRoot);
	logger.success(`Block "${blockName}" generation complete.`);
}
