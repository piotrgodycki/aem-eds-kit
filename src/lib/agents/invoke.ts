import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentInfo } from "../../types/index.js";
import { logger } from "../logger.js";

/**
 * Save a prompt to a temp file and return its path.
 */
export async function savePromptToFile(prompt: string): Promise<string> {
	const dir = path.join(tmpdir(), "eds-cli");
	await mkdir(dir, { recursive: true });
	const filename = `from-figma-${Date.now()}.md`;
	const filePath = path.join(dir, filename);
	await writeFile(filePath, prompt, "utf-8");
	return filePath;
}

/**
 * Invoke an AI agent with the given prompt file.
 * Returns true if the agent ran successfully.
 */
export async function invokeAgent(
	agent: AgentInfo,
	promptFile: string,
	cwd: string,
): Promise<boolean> {
	const { execa } = await import("execa");
	const prompt = await readFile(promptFile, "utf-8");

	try {
		switch (agent.type) {
			case "claude": {
				logger.info("Running Claude Code (this may take a minute)...");
				// Grant the Figma MCP server at the server level (`mcp__<server>`
				// allows all of its tools). Use the detected server name when we
				// have it, otherwise allow every common variant so desktop- and
				// SSE-configured users both work out of the box.
				const figmaServers = agent.figmaMcpServerName
					? [agent.figmaMcpServerName]
					: ["figma-sse", "figma-desktop", "figma", "Figma"];
				const allowedTools = [
					...figmaServers.map((s) => `mcp__${s}`),
					"Edit",
					"Write",
					"Read",
				].join(",");
				await execa(
					"claude",
					["-p", prompt, "--output-format", "text", "--allowedTools", allowedTools],
					{
						cwd,
						stdio: "inherit",
					},
				);
				break;
			}
			case "cursor": {
				logger.info("Running Cursor agent...");
				await execa("cursor", ["--prompt", prompt], {
					cwd,
					stdio: "inherit",
				});
				break;
			}
			case "codex": {
				logger.info("Running Codex...");
				await execa("codex", [prompt], {
					cwd,
					stdio: "inherit",
				});
				break;
			}
		}
		return true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Agent ${agent.type} failed: ${msg}`);
		return false;
	}
}
