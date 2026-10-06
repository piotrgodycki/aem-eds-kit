import type { z } from "zod";
import type {
	edsConfigSchema,
	edsMetaSchema,
	edsProjectSchema,
	figmaUrlSchema,
} from "../lib/schemas.js";

export type EdsConfig = z.infer<typeof edsConfigSchema>;
export type EdsProject = z.infer<typeof edsProjectSchema>;
export type EdsMeta = z.infer<typeof edsMetaSchema>;
export type FigmaUrlParts = z.infer<typeof figmaUrlSchema>;

export type AgentType = "claude" | "cursor" | "codex";

export interface AgentInfo {
	type: AgentType;
	path: string;
	configDir?: string;
	hasFigmaMcp: boolean;
	/** The actual MCP server name found in config (e.g. "figma-sse", "figma-desktop"). */
	figmaMcpServerName?: string;
}

export interface BlockCreateOptions {
	name: string;
	withUeModel?: boolean;
	directory?: string;
}

export interface BlockFromDesignOptions {
	url?: string;
	name?: string;
	agent?: AgentType | "none";
	dryRun?: boolean;
	withUeModel?: boolean;
	yes?: boolean;
	headless?: boolean;
	update?: boolean;
}

export interface DoctorCheckResult {
	name: string;
	status: "pass" | "warn" | "fail";
	message: string;
}

export interface AdminApiOptions {
	org: string;
	site: string;
	ref?: string;
}
