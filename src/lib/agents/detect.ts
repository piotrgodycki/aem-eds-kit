import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentType, AgentInfo } from "../../types/index.js";
import { logger } from "../logger.js";

interface AgentDef {
	type: AgentType;
	binary: string;
	configDir: string;
	mcpConfigPaths: string[];
}

const AGENT_DEFS: AgentDef[] = [
	{
		type: "claude",
		binary: "claude",
		configDir: path.join(homedir(), ".claude"),
		mcpConfigPaths: [
			path.join(homedir(), ".claude", "plugins.json"),
			path.join(homedir(), ".claude.json"),
		],
	},
	{
		type: "cursor",
		binary: "cursor",
		configDir: path.join(homedir(), ".cursor"),
		mcpConfigPaths: [path.join(homedir(), ".cursor", "mcp.json")],
	},
	{
		type: "codex",
		binary: "codex",
		configDir: path.join(homedir(), ".codex"),
		mcpConfigPaths: [],
	},
];

async function whichBinary(name: string): Promise<string | undefined> {
	const { execaCommand } = await import("execa");
	try {
		const result = await execaCommand(`which ${name}`);
		return result.stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

async function hasFigmaMcpConfigured(configPaths: string[]): Promise<boolean> {
	for (const configPath of configPaths) {
		try {
			if (!existsSync(configPath)) continue;
			const content = await readFile(configPath, "utf-8");
			const lower = content.toLowerCase();
			if (lower.includes("figma")) return true;
		} catch {
			continue;
		}
	}
	return false;
}

export async function detectAgent(preferred?: AgentType): Promise<AgentInfo | undefined> {
	// If user specified a preferred agent, try that first
	if (preferred) {
		const def = AGENT_DEFS.find((d) => d.type === preferred);
		if (def) {
			const binPath = await whichBinary(def.binary);
			if (binPath) {
				return {
					type: def.type,
					path: binPath,
					configDir: existsSync(def.configDir) ? def.configDir : undefined,
					hasFigmaMcp: await hasFigmaMcpConfigured(def.mcpConfigPaths),
				};
			}
			logger.warn(`Preferred agent "${preferred}" not found in PATH`);
		}
	}

	// Auto-detect: try each agent in order
	for (const def of AGENT_DEFS) {
		const binPath = await whichBinary(def.binary);
		if (binPath) {
			return {
				type: def.type,
				path: binPath,
				configDir: existsSync(def.configDir) ? def.configDir : undefined,
				hasFigmaMcp: await hasFigmaMcpConfigured(def.mcpConfigPaths),
			};
		}
	}

	return undefined;
}

export async function detectAllAgents(): Promise<AgentInfo[]> {
	const agents: AgentInfo[] = [];
	for (const def of AGENT_DEFS) {
		const binPath = await whichBinary(def.binary);
		if (binPath) {
			agents.push({
				type: def.type,
				path: binPath,
				configDir: existsSync(def.configDir) ? def.configDir : undefined,
				hasFigmaMcp: await hasFigmaMcpConfigured(def.mcpConfigPaths),
			});
		}
	}
	return agents;
}
