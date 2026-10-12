/**
 * The Fetch phase of the fetch→cache→generate pipeline.
 *
 * `resolveDesign()` turns a design reference (Figma URL parts, or a local
 * export) into a {@link DesignInput} the prompt embeds — picking the cheapest
 * adapter and caching the result so retries/refines never re-fetch:
 *
 *   local file  →  Figma cache hit  →  Figma REST (token)  →  Figma MCP (1 call)
 *
 * The design snapshot is materialized to `tmp/eds-cli/design-cache/` (gitignored
 * via `tmp/`), keyed by fileKey+node, so it's inspectable and reusable.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FigmaUrlParts } from "../../types/index.js";
import type { DesignInput } from "./prompt-builder.js";
import { fetchFigmaNode, serializeDesign } from "./rest.js";

/** Absolute path of the cached design snapshot for a Figma file/node. */
export function designCachePath(projectRoot: string, fileKey: string, nodeId?: string): string {
	const safe = (s: string) => s.replace(/[^a-z0-9._-]/gi, "-");
	const key = `${safe(fileKey)}__${safe(nodeId ?? "file")}.json`;
	return path.join(projectRoot, "tmp", "eds-cli", "design-cache", key);
}

async function readCache(p: string): Promise<string | null> {
	if (!existsSync(p)) return null;
	try {
		return await readFile(p, "utf-8");
	} catch {
		return null;
	}
}

async function writeCache(p: string, spec: string): Promise<void> {
	await mkdir(path.dirname(p), { recursive: true });
	await writeFile(p, spec, "utf-8");
}

export interface ResolveDesignOptions {
	figma: FigmaUrlParts | null;
	/** Project-relative path to a local SVG/PNG export, if the user passed one. */
	localFile?: string | null;
	/** Figma Personal Access Token (from `figma.token` config or `FIGMA_TOKEN`). */
	token?: string;
	projectRoot: string;
	/** Force the MCP adapter even when a token is available. */
	preferMcp?: boolean;
	/** Ignore any cached spec and re-fetch. */
	refresh?: boolean;
}

export interface ResolvedDesign {
	/** undefined → non-Figma provider: the prompt uses the generic provider-MCP path. */
	design?: DesignInput;
	/** One-line human summary of which adapter was used. */
	summary: string;
	/** Set when a REST fetch was attempted and failed (and we fell back to MCP). */
	restError?: string;
}

export async function resolveDesign(opts: ResolveDesignOptions): Promise<ResolvedDesign> {
	// 1) Local export wins — zero network.
	if (opts.localFile) {
		return {
			design: { mode: "file", filePath: opts.localFile },
			summary: `local file ${opts.localFile}`,
		};
	}

	const { figma, projectRoot } = opts;
	if (!figma?.fileKey) return { summary: "provider MCP" }; // non-figma provider

	const cp = designCachePath(projectRoot, figma.fileKey, figma.nodeId);
	const cpRel = path.relative(projectRoot, cp);

	// 2) Reuse a cached snapshot (unless --refresh).
	if (!opts.refresh) {
		const cached = await readCache(cp);
		if (cached) {
			return {
				design: { mode: "spec", spec: cached, cachePath: cpRel },
				summary: `cache ${cpRel}`,
			};
		}
	}

	// 3) REST "scrape" when a token is available and MCP isn't forced.
	if (opts.token && !opts.preferMcp) {
		try {
			const raw = await fetchFigmaNode({
				fileKey: figma.fileKey,
				nodeId: figma.nodeId,
				token: opts.token,
			});
			const spec = serializeDesign(raw, figma.nodeId);
			await writeCache(cp, spec);
			return { design: { mode: "spec", spec, cachePath: cpRel }, summary: `REST → ${cpRel}` };
		} catch (e) {
			return {
				design: { mode: "mcp", cachePath: cpRel },
				summary: "MCP (REST failed — 1 call)",
				restError: e instanceof Error ? e.message : String(e),
			};
		}
	}

	// 4) MCP fallback — the agent fetches once and dumps to the cache.
	return { design: { mode: "mcp", cachePath: cpRel }, summary: "MCP (1 call, cached)" };
}
