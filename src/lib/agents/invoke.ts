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
				// Grant Figma MCP at the server level (`mcp__<server>` allows all of
				// its tools). We grant a *superset*, not just the detected server:
				// a user may have several Figma servers configured where the first
				// one found is stale/disconnected (e.g. a dead `figma-sse` alongside
				// a live plugin). Granting every known variant lets the agent fall
				// through to whichever one actually responds. Granting a server that
				// doesn't exist is harmless.
				const figmaServers = [
					...(agent.figmaMcpServerName ? [agent.figmaMcpServerName] : []),
					"figma-sse",
					"figma-desktop",
					"figma",
					"Figma",
					"plugin_figma_figma", // Claude Code plugin: plugin:figma:figma
				];
				const allowedTools = [
					...new Set(figmaServers.map((s) => `mcp__${s}`)),
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
