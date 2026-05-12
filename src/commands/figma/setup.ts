import chalk from "chalk";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { detectAllAgents, detectAgent } from "../../lib/agents/detect.js";
import { globalConfigDir, globalConfigPath, loadConfig } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export async function figmaSetup(): Promise<void> {
	const { select, confirm } = await import("@inquirer/prompts");

	logger.info(chalk.bold("\nFigma MCP Setup Wizard\n"));

	// Step 1: Detect agents
	logger.info("Detecting installed AI agents...");
	const agents = await detectAllAgents();

	let selectedAgent: string;

	if (agents.length === 0) {
		logger.warn("No AI agents found (claude, cursor, codex).");
		logger.info(`Install Claude Code: ${chalk.cyan("npm install -g @anthropic-ai/claude-code")}`);
		selectedAgent = "none";
	} else {
		logger.success(
			`Found: ${agents.map((a) => chalk.cyan(a.type)).join(", ")}`,
		);

		selectedAgent = await select({
			message: "Which agent do you want to use with eds-cli?",
			choices: [
				...agents.map((a) => ({
					name: `${a.type}${a.hasFigmaMcp ? chalk.green(" (Figma MCP detected)") : ""}`,
					value: a.type,
				})),
				{ name: "None (manual mode)", value: "none" },
			],
		});
	}

	// Step 2: Check Figma MCP
	if (selectedAgent !== "none") {
		const agent = agents.find((a) => a.type === selectedAgent);
		if (agent && !agent.hasFigmaMcp) {
			logger.warn(`Figma MCP is not configured for ${selectedAgent}.\n`);
			logger.info("Install it with one of these methods:\n");

			switch (selectedAgent) {
				case "claude":
					logger.info(
						`  ${chalk.cyan("claude mcp add --transport sse figma-sse https://mcp.figma.com/sse")}`,
					);
					logger.info("  or for Figma Desktop app:");
					logger.info(
						`  ${chalk.cyan("claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp")}`,
					);
					break;
				case "cursor":
					logger.info(
						`  Add to ${chalk.cyan("~/.cursor/mcp.json")}:`,
					);
					logger.info(
						chalk.dim(
							JSON.stringify(
								{
									mcpServers: {
										figma: { url: "https://mcp.figma.com/sse" },
									},
								},
								null,
								2,
							),
						),
					);
					break;
				case "codex":
					logger.info(
						"  See Figma MCP docs: https://help.figma.com/hc/en-us/articles/32132100833559",
					);
					break;
			}
			logger.info("");
		} else if (agent?.hasFigmaMcp) {
			logger.success(`Figma MCP is already configured for ${selectedAgent}!`);
		}
	}

	// Step 3: Figma seat info
	logger.info(
		chalk.dim(
			"\nNote: Figma MCP requires a Figma seat (Dev or Full on paid plans for desktop server).",
		),
	);

	// Step 4: Save config
	const shouldSave = await confirm({
		message: "Save preferences to ~/.eds/config.json?",
		default: true,
	});

	if (shouldSave) {
		const configDir = globalConfigDir();
		if (!existsSync(configDir)) {
			await mkdir(configDir, { recursive: true });
		}

		const config: Record<string, unknown> = {};
		if (selectedAgent !== "none") {
			config.agent = selectedAgent;
		}

		await writeFile(globalConfigPath(), JSON.stringify(config, null, 2) + "\n", {
			mode: 0o600,
		});
		logger.success(`Config saved to ${chalk.cyan(globalConfigPath())}`);
	}

	logger.info(chalk.bold("\nSetup complete!"));
	if (selectedAgent !== "none") {
		logger.info(
			`Try: ${chalk.cyan('eds block from-figma "<figma-url>" --dry-run')}`,
		);
	}
}
