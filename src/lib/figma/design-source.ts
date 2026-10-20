/**
 * The Fetch phase of the fetch→cache→generate pipeline.
 *
 * `resolveDesign()` turns a design reference (Figma URL parts, or a local
 * export) into a {@link DesignInput} the prompt embeds — picking the cheapest
 * adapter and caching the result so retries/refines never re-fetch:
 *
 *   local file  →  web scrape (Framer/Stitch)  →  Figma cache hit  →  Figma REST
 *   (token)  →  Figma MCP (1 call)
 *
 * Figma paints to a WebGL canvas (REST/MCP only); Framer and Google Stitch render
 * real HTML, so they're scraped with headless Chromium. The snapshot is
 * materialized to `tmp/eds-cli/design-cache/` (gitignored via `tmp/`), so it's
 * inspectable and reusable across retries/refines.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FigmaUrlParts } from "../../types/index.js";
import { scrapeWebDesign } from "../scrape/web.js";
import type { DesignInput, DesignProvider } from "./prompt-builder.js";
import { FigmaRateLimitError, fetchFigmaNode, serializeDesign } from "./rest.js";

/** Absolute path of the cached design snapshot for a Figma file/node. */
export function designCachePath(projectRoot: string, fileKey: string, nodeId?: string): string {
	const safe = (s: string) => s.replace(/[^a-z0-9._-]/gi, "-");
	const key = `${safe(fileKey)}__${safe(nodeId ?? "file")}.json`;
	return path.join(projectRoot, "tmp", "eds-cli", "design-cache", key);
}

/** Cache path for a scraped web design, keyed by a sanitized URL. */
export function urlCachePath(projectRoot: string, url: string): string {
	const key = `scrape__${url.replace(/[^a-z0-9._-]/gi, "-").slice(0, 120)}.json`;
	return path.join(projectRoot, "tmp", "eds-cli", "design-cache", key);
}

/** Providers whose designs are real HTML/DOM pages, so we can scrape them. */
export function isScrapeable(provider?: DesignProvider): provider is DesignProvider {
	return provider === "framer" || provider === "stitch";
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
	/** Design provider — selects the adapter (figma → REST/MCP, framer/stitch → scrape). */
	provider?: DesignProvider;
	/** The raw design URL (for the scrape adapter). */
	designUrl?: string;
	/** Saved Playwright session for scraping a gated source (storageState file). */
	storageStatePath?: string;
	/** Dry run — don't launch a browser / hit the network; describe the fetch only. */
	dryRun?: boolean;
}

export interface ResolvedDesign {
	/** undefined → the design couldn't be resolved (missing URL, or scrape failed). */
	design?: DesignInput;
	/** One-line human summary of which adapter was used. */
	summary: string;
	/** Set when a REST fetch was attempted and failed (and we fell back to MCP). */
	restError?: string;
	/**
	 * Set when REST hit Figma's rate limit. No MCP fallback in that case: the MCP
	 * budget is the same or smaller, so falling back would silently spend it.
	 */
	rateLimit?: FigmaRateLimitError;
	/** Set when a scrape was attempted and failed. */
	scrapeError?: string;
}

export async function resolveDesign(opts: ResolveDesignOptions): Promise<ResolvedDesign> {
	const { figma, projectRoot } = opts;

	// 1) Local export wins — zero network.
	if (opts.localFile) {
		return {
			design: { mode: "file", filePath: opts.localFile },
			summary: `local file ${opts.localFile}`,
		};
	}

	// 2) Scrapeable web provider (Framer / Stitch) → headless-Chromium scrape.
	if (isScrapeable(opts.provider) && opts.designUrl) {
		const cp = urlCachePath(projectRoot, opts.designUrl);
		const cpRel = path.relative(projectRoot, cp);
		if (opts.dryRun) {
			return {
				design: {
					mode: "scrape",
					spec: `{ "note": "dry run — the live ${opts.provider} page is scraped at generate time", "url": "${opts.designUrl}" }`,
					cachePath: cpRel,
				},
				summary: `scrape (dry run) ${opts.designUrl}`,
			};
		}
		if (!opts.refresh) {
			const cached = await readCache(cp);
			if (cached)
				return {
					design: { mode: "scrape", spec: cached, cachePath: cpRel },
					summary: `cache ${cpRel}`,
				};
		}
		try {
			const spec = await scrapeWebDesign({
				url: opts.designUrl,
				provider: opts.provider,
				projectRoot,
				storageStatePath: opts.storageStatePath,
			});
			await writeCache(cp, spec);
			return { design: { mode: "scrape", spec, cachePath: cpRel }, summary: `scrape → ${cpRel}` };
		} catch (e) {
			return { summary: "scrape failed", scrapeError: e instanceof Error ? e.message : String(e) };
		}
	}

	if (!figma?.fileKey) return { summary: "no design source" }; // nothing to resolve

	const cp = designCachePath(projectRoot, figma.fileKey, figma.nodeId);
	const cpRel = path.relative(projectRoot, cp);

	// 3) Reuse a cached Figma snapshot (unless --refresh).
	if (!opts.refresh) {
		const cached = await readCache(cp);
		if (cached) {
			return {
				design: { mode: "spec", spec: cached, cachePath: cpRel },
				summary: `cache ${cpRel}`,
			};
		}
	}

	// 4) Figma REST when a token is available and MCP isn't forced.
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
			if (e instanceof FigmaRateLimitError) {
				return { summary: "REST rate-limited", restError: e.message, rateLimit: e };
			}
			return {
				design: { mode: "mcp", cachePath: cpRel },
				summary: "MCP (REST failed — 1 call)",
				restError: e instanceof Error ? e.message : String(e),
			};
		}
	}

	// 5) Figma MCP fallback — the agent fetches once and dumps to the cache.
	return { design: { mode: "mcp", cachePath: cpRel }, summary: "MCP (1 call, cached)" };
}
