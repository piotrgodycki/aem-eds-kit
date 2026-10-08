import { z } from "zod";

export const figmaUrlSchema = z.object({
	fileKey: z.string().min(1),
	nodeId: z.string().optional(),
	fileName: z.string().optional(),
});

export const edsConfigSchema = z.object({
	agent: z.enum(["claude", "cursor", "codex"]).optional(),
	figma: z
		.object({
			mcpEndpoint: z.string().url().optional(),
			token: z.string().optional(),
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
				source: z.enum(["figma", "default"]).optional(),
			}),
		)
		.optional(),
});

export const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export type FigmaUrlParts = z.infer<typeof figmaUrlSchema>;
export type EdsConfig = z.infer<typeof edsConfigSchema>;
export type EdsProject = z.infer<typeof edsProjectSchema>;
export type EdsMeta = z.infer<typeof edsMetaSchema>;
