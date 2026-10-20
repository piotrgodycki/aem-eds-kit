import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentInfo, AgentType } from "../../types/index.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { findProjectRoot } from "../project.js";
import {
	LOCAL_AGENT_TYPES,
	LOCAL_DEFAULT_URLS,
	LOCAL_NAMES,
	type LocalAgentType,
	isLocalAgent,
	pickModel,
	probeLocalServer,
} from "./local.js";

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

/**
 * Walk a config object looking for `mcpServers` maps (at any depth — Claude
 * stores them both at the root and per-project) and return the first server
 * key that mentions Figma. That key is the exact name we must grant tools for.
 */
function findFigmaServerKey(node: unknown): string | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;

	const servers = obj.mcpServers;
	if (servers && typeof servers === "object") {
		for (const key of Object.keys(servers as Record<string, unknown>)) {
			if (key.toLowerCase().includes("figma")) return key;
		}
	}

	for (const value of Object.values(obj)) {
		const found = findFigmaServerKey(value);
		if (found) return found;
	}
	return undefined;
}

/**
 * Find the configured Figma MCP server name across an agent's config files.
 * Falls back to a loose text match (returns "figma" as a sentinel) so older
 * configs still report as "configured" even if we can't parse the exact key.
 */
async function findFigmaMcpServer(configPaths: string[]): Promise<string | undefined> {
	for (const configPath of configPaths) {
		try {
			if (!existsSync(configPath)) continue;
			const content = await readFile(configPath, "utf-8");
			try {
				const key = findFigmaServerKey(JSON.parse(content));
				if (key) return key;
			} catch {
				// Not JSON (or malformed) — fall back to a text match below.
			}
			if (content.toLowerCase().includes("figma")) return "figma";
		} catch {
			// Unreadable config — skip to the next path.
		}
	}
	return undefined;
}

/**
 * A running local model server, with the model to use (config `local.model`,
 * else a coder model it has). Undefined when it isn't reachable or has no model.
 */
export async function detectLocalAgent(type: LocalAgentType): Promise<AgentInfo | undefined> {
	const root = findProjectRoot() ?? undefined;
	const local = (await loadConfig(root)).local;
	const baseUrl = local?.baseUrl ?? LOCAL_DEFAULT_URLS[type];
	const models = await probeLocalServer(type, baseUrl);
	if (!models) return undefined;
	const model = local?.model ?? pickModel(models);
	if (!model) {
		logger.warn(
			`${LOCAL_NAMES[type]} at ${baseUrl} has no models - pull one first (e.g. \`ollama pull qwen2.5-coder:14b\`).`,
		);
		return undefined;
	}
	return { type, path: baseUrl, baseUrl, model, hasFigmaMcp: false };
}

export async function detectAgent(preferred?: AgentType): Promise<AgentInfo | undefined> {
	if (preferred && isLocalAgent(preferred)) {
		const local = await detectLocalAgent(preferred);
		if (local) return local;
		logger.warn(`${LOCAL_NAMES[preferred]} isn't reachable - is it running?`);
		return undefined;
	}
	// If user specified a preferred agent, try that first
	if (preferred) {
		const def = AGENT_DEFS.find((d) => d.type === preferred);
		if (def) {
			const binPath = await whichBinary(def.binary);
			if (binPath) {
				const figmaMcpServerName = await findFigmaMcpServer(def.mcpConfigPaths);
				return {
					type: def.type,
					path: binPath,
					configDir: existsSync(def.configDir) ? def.configDir : undefined,
					hasFigmaMcp: !!figmaMcpServerName,
					figmaMcpServerName,
				};
			}
			logger.warn(`Preferred agent "${preferred}" not found in PATH`);
		}
	}

	// Auto-detect: try each agent in order
	for (const def of AGENT_DEFS) {
		const binPath = await whichBinary(def.binary);
		if (binPath) {
			const figmaMcpServerName = await findFigmaMcpServer(def.mcpConfigPaths);
			return {
				type: def.type,
				path: binPath,
				configDir: existsSync(def.configDir) ? def.configDir : undefined,
				hasFigmaMcp: !!figmaMcpServerName,
				figmaMcpServerName,
			};
		}
	}

	// No CLI agent: use a local model server if one is running.
	for (const type of LOCAL_AGENT_TYPES.filter((t) => t !== "local")) {
		const local = await detectLocalAgent(type);
		if (local) return local;
	}

	return undefined;
}

export async function detectAllAgents(): Promise<AgentInfo[]> {
	const agents: AgentInfo[] = [];
	for (const def of AGENT_DEFS) {
		const binPath = await whichBinary(def.binary);
		if (binPath) {
			const figmaMcpServerName = await findFigmaMcpServer(def.mcpConfigPaths);
			agents.push({
				type: def.type,
				path: binPath,
				configDir: existsSync(def.configDir) ? def.configDir : undefined,
				hasFigmaMcp: !!figmaMcpServerName,
				figmaMcpServerName,
			});
		}
	}
	for (const type of LOCAL_AGENT_TYPES.filter((t) => t !== "local")) {
		const local = await detectLocalAgent(type);
		if (local) agents.push(local);
	}
	return agents;
}
