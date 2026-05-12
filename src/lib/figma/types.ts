import { z } from "zod";

/**
 * Zod schemas for Figma MCP response validation.
 * Used in headless mode (v0.3.0) and for test fixture validation.
 */

export const figmaDesignContextSchema = z.object({
	name: z.string().optional(),
	type: z.string().optional(),
	code: z.string().optional(),
	screenshot: z.string().optional(),
	annotations: z.array(z.string()).optional(),
	componentDocs: z.array(z.string()).optional(),
});

export const figmaVariableDefSchema = z.object({
	name: z.string(),
	resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]),
	valuesByMode: z.record(z.unknown()),
});

export const figmaVariablesResponseSchema = z.object({
	variables: z.array(figmaVariableDefSchema).optional(),
	collections: z.array(z.object({ name: z.string(), modes: z.array(z.string()) })).optional(),
});

export type FigmaDesignContext = z.infer<typeof figmaDesignContextSchema>;
export type FigmaVariableDef = z.infer<typeof figmaVariableDefSchema>;
export type FigmaVariablesResponse = z.infer<typeof figmaVariablesResponseSchema>;
