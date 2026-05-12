import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
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
 */
export async function invokeAgent(
	agent: AgentInfo,
	promptFile: string,
	cwd: string,
): Promise<void> {
	const { execa } = await import("execa");

	switch (agent.type) {
		case "claude": {
			logger.info(`Running Claude Code with prompt...`);
			// Claude Code: pipe the prompt via stdin or use --print with file
			const prompt = await import("node:fs/promises").then((fs) =>
				fs.readFile(promptFile, "utf-8"),
			);
			await execa("claude", ["--print", prompt], {
				cwd,
				stdio: "inherit",
			});
			break;
		}
		case "cursor": {
			logger.info(`Running Cursor agent with prompt...`);
			const prompt = await import("node:fs/promises").then((fs) =>
				fs.readFile(promptFile, "utf-8"),
			);
			await execa("cursor", ["--prompt", prompt], {
				cwd,
				stdio: "inherit",
			});
			break;
		}
		case "codex": {
			logger.info(`Running Codex with prompt...`);
			const prompt = await import("node:fs/promises").then((fs) =>
				fs.readFile(promptFile, "utf-8"),
			);
			await execa("codex", [prompt], {
				cwd,
				stdio: "inherit",
			});
			break;
		}
	}
}
