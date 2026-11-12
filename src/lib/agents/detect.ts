import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentInfo, AgentType } from "../../types/index.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { findProjectRoot } from "../project.js";
import {
	isLocalAgent,
	LOCAL_AGENT_TYPES,
	LOCAL_DEFAULT_URLS,
	LOCAL_NAMES,
	type LocalAgentType,
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

/**
 * Where a command lives on PATH, like `which` / `where` but without spawning
 * either (Windows has no `which`). On Windows each PATHEXT extension is tried,
 * since npm installs CLIs there as `claude.cmd`.
 */
export function findOnPath(
	name: string,
	env: { path?: string; pathext?: string; platform?: NodeJS.Platform } = {},
	isFile: (file: string) => boolean = (f) => {
		try {
			return statSync(f).isFile();
		} catch {
			return false;
		}
	},
): string | undefined {
	const platform = env.platform ?? process.platform;
	const win = platform === "win32";
	const dirs = (env.path ?? process.env.PATH ?? process.env.Path ?? "")
		.split(win ? ";" : ":")
		.filter(Boolean);
	const exts = win
		? [
				"",
				...(env.pathext ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean),
			]
		: [""];
	const join = win ? path.win32.join : path.posix.join;
	for (const dir of dirs)
		for (const ext of exts) {
			const file = join(dir.replace(/^"(.*)"$/, "$1"), name + ext.toLowerCase());
			if (isFile(file)) return file;
			if (ext && isFile(join(dir, name + ext))) return join(dir, name + ext);
		}
	return undefined;
}

async function whichBinary(name: string): Promise<string | undefined> {
	return findOnPath(name);
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

/** One agent as `eds agents` reports it: installed or not, set up or not, and what to do next. */
export interface AgentStatus {
	type: AgentType;
	name: string;
	/** A CLI on PATH, or a local model server that answers. */
	installed: boolean;
	path?: string;
	/** Signed in or configured, as far as the files on disk tell (a CLI agent's login, a local server's model). */
	ready: boolean;
	figmaMcp: boolean;
	model?: string;
	/** What to run or do to install it / to sign in with the account (not an API key). */
	install: string;
	signIn: string;
}

const CLI_AGENTS: Record<
	"claude" | "cursor" | "codex",
	{ name: string; install: string; signIn: string; ready: string[] }
> = {
	claude: {
		name: "Claude Code",
		install: "npm install -g @anthropic-ai/claude-code",
		signIn: "Run `claude` once and sign in with your Claude account (Pro / Max) when it asks.",
		ready: [
			path.join(homedir(), ".claude.json"),
			path.join(homedir(), ".claude", ".credentials.json"),
		],
	},
	cursor: {
		name: "Cursor",
		install: "Install Cursor from cursor.com and its `cursor` command (Shell Command: Install).",
		signIn: "Open Cursor and sign in with your Cursor account.",
		ready: [path.join(homedir(), ".cursor")],
	},
	codex: {
		name: "Codex",
		install: "npm install -g @openai/codex",
		signIn: "Run `codex login` and sign in with your ChatGPT account.",
		ready: [path.join(homedir(), ".codex", "auth.json")],
	},
};

const LOCAL_HINTS: Record<"ollama" | "omlx", { install: string; signIn: string }> = {
	ollama: {
		install: "Install Ollama from ollama.com and start it.",
		signIn: "No account: pull a coder model, e.g. `ollama pull qwen2.5-coder:14b`.",
	},
	omlx: {
		install: "Install oMLX (Apple Silicon) and start its server on port 8000.",
		signIn: "No account: load a coder model in oMLX.",
	},
};

export interface AgentProbe {
	which: (binary: string) => Promise<string | undefined>;
	exists: (file: string) => boolean;
	figmaMcp: (configPaths: string[]) => Promise<string | undefined>;
	local: (type: "ollama" | "omlx") => Promise<string[] | null>;
}

const realProbe: AgentProbe = {
	which: whichBinary,
	exists: existsSync,
	figmaMcp: findFigmaMcpServer,
	local: (type) => probeLocalServer(type),
};

/** Every agent `eds` can drive, installed or not, for `eds agents` and tools like aem-eds-studio. */
export async function listAgentStatus(probe: AgentProbe = realProbe): Promise<AgentStatus[]> {
	const out: AgentStatus[] = [];
	for (const def of AGENT_DEFS) {
		const meta = CLI_AGENTS[def.type as keyof typeof CLI_AGENTS];
		const bin = await probe.which(def.binary);
		out.push({
			type: def.type,
			name: meta.name,
			installed: !!bin,
			...(bin ? { path: bin } : {}),
			ready: !!bin && meta.ready.some((f) => probe.exists(f)),
			figmaMcp: !!bin && !!(await probe.figmaMcp(def.mcpConfigPaths)),
			install: meta.install,
			signIn: meta.signIn,
		});
	}
	for (const type of ["ollama", "omlx"] as const) {
		const models = await probe.local(type);
		const model = models ? pickModel(models) : undefined;
		out.push({
			type,
			name: LOCAL_NAMES[type],
			installed: !!models,
			...(models ? { path: LOCAL_DEFAULT_URLS[type] } : {}),
			ready: !!model,
			figmaMcp: false,
			...(model ? { model } : {}),
			...LOCAL_HINTS[type],
		});
	}
	return out;
}
