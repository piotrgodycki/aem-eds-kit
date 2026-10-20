import { z } from "zod";

export const figmaUrlSchema = z.object({
	fileKey: z.string().min(1),
	nodeId: z.string().optional(),
	fileName: z.string().optional(),
});

export const edsConfigSchema = z.object({
	agent: z.enum(["claude", "cursor", "codex", "ollama", "omlx", "local"]).optional(),
	/** Local model server (Ollama / oMLX / any OpenAI-compatible) used by those agents. */
	local: z
		.object({
			/** Server URL (default: Ollama http://127.0.0.1:11434, oMLX http://127.0.0.1:8000/v1). */
			baseUrl: z.string().url().optional(),
			/** Model to run (default: a coder model the server has). */
			model: z.string().optional(),
			/** Context window to request from Ollama (num_ctx). Default 32768. */
			contextTokens: z.number().int().positive().optional(),
			/** Bearer token, for servers that want one. */
			apiKey: z.string().optional(),
		})
		.optional(),
	/**
	 * Model the agent runs block generation with (e.g. "sonnet", "opus",
	 * "haiku", or a full model id). Defaults to a fast model for codegen when
	 * unset — block generation is bounded, structured work where Sonnet is both
	 * quick and accurate, so we don't burn Opus-grade latency on it.
	 */
	model: z.string().optional(),
	figma: z
		.object({
			mcpEndpoint: z.string().url().optional(),
			token: z.string().optional(),
			/** Figma REST calls per minute to stay under (Tier 1 Dev/Full: 10 Pro, 15 Org, 20 Ent). */
			restPerMinute: z.number().int().positive().optional(),
		})
		.optional(),
	admin: z
		.object({
			org: z.string().optional(),
			site: z.string().optional(),
			ref: z.string().default("main"),
		})
		.optional(),
});

export const edsProjectSchema = z.object({
	root: z.string(),
	hasFstab: z.boolean(),
	hasBlocks: z.boolean(),
	hasHeadHtml: z.boolean(),
});

export const edsMetaSchema = z.object({
	figmaFileKey: z.string(),
	figmaNodeId: z.string().optional(),
	lastSyncedAt: z.string().datetime(),
	promptVersion: z.string(),
	agentUsed: z.string().optional(),
	/** Design frame breakpoints that drive `eds block preview` widths. */
	breakpoints: z
		.array(
			z.object({
				width: z.number(),
				label: z.string().optional(),
				source: z.enum(["figma", "scrape", "default"]).optional(),
			}),
		)
		.optional(),
});

export const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export type FigmaUrlParts = z.infer<typeof figmaUrlSchema>;
export type EdsConfig = z.infer<typeof edsConfigSchema>;
export type EdsProject = z.infer<typeof edsProjectSchema>;
export type EdsMeta = z.infer<typeof edsMetaSchema>;
