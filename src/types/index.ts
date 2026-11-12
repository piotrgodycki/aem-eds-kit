import type { z } from "zod";
import type { figmaUrlSchema } from "../lib/schemas.js";

export type FigmaUrlParts = z.infer<typeof figmaUrlSchema>;

/** CLI agents (Claude Code, Cursor, Codex) and local model servers (Ollama, oMLX, any OpenAI-compatible). */
export type AgentType = "claude" | "cursor" | "codex" | "ollama" | "omlx" | "local";

export interface AgentInfo {
	type: AgentType;
	path: string;
	configDir?: string;
	hasFigmaMcp: boolean;
	/** The actual MCP server name found in config (e.g. "figma-sse", "figma-desktop"). */
	figmaMcpServerName?: string;
	/** Local model servers: the server URL and the model picked on it. */
	baseUrl?: string;
	model?: string;
}

export interface DoctorCheckResult {
	name: string;
	status: "pass" | "warn" | "fail";
	message: string;
}
