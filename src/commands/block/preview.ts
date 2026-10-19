import { existsSync, watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../../lib/logger.js";
import {
	type Breakpoint,
	type GalleryItem,
	buildGallery,
	buildInner,
	buildOuter,
} from "../../lib/preview/harness.js";
import { startServer } from "../../lib/preview/server.js";
import { findProjectRoot } from "../../lib/project.js";
import * as ui from "../../lib/ui.js";

/** Blocks that are page chrome, not previewable content blocks. */
const CHROME_BLOCKS = new Set(["header", "footer"]);

interface PreviewOptions {
	port?: string;
	widths?: string;
	open?: boolean; // commander sets open=false for --no-open
}

const DEFAULT_WIDTHS = [375, 768, 1280];

function labelFor(width: number): string {
	if (width <= 480) return `${width} mobile`;
	if (width <= 1024) return `${width} tablet`;
	return `${width} desktop`;
}

/** Build breakpoints from --widths, else .eds-meta.json, else sane defaults. */
function resolveBreakpoints(
	widthsFlag: string | undefined,
	meta: Record<string, unknown> | null,
): Breakpoint[] {
	if (widthsFlag) {
		const widths = widthsFlag
			.split(",")
			.map((w) => Number.parseInt(w.trim(), 10))
			.filter((w) => Number.isFinite(w) && w > 0);
		if (widths.length) return widths.map((w) => ({ width: w, label: labelFor(w), figma: false }));
	}

	const metaBps = meta?.breakpoints;
	if (Array.isArray(metaBps) && metaBps.length) {
		return metaBps
			.map((b) => ({
				width: Number(b.width),
				label: typeof b.label === "string" ? b.label : labelFor(Number(b.width)),
				// A scraped page width is a real design frame too (from-design asks for "scrape").
				figma: b.source === "figma" || b.source === "scrape",
			}))
			.filter((b) => Number.isFinite(b.width) && b.width > 0);
	}

	return DEFAULT_WIDTHS.map((w) => ({ width: w, label: labelFor(w), figma: false }));
}

function figmaUrlFromMeta(meta: Record<string, unknown> | null): string | undefined {
	if (!meta?.figmaFileKey || typeof meta.figmaFileKey !== "string") return undefined;
	const node =
		typeof meta.figmaNodeId === "string" ? meta.figmaNodeId.replace(":", "-") : undefined;
	const base = `https://www.figma.com/design/${meta.figmaFileKey}/preview`;
	return node ? `${base}?node-id=${node}` : base;
}

function defaultSample(blockName: string): string {
	return `<div class="${blockName} block">
  <div><div>
    <h2>${blockName} heading</h2>
    <p>Sample body copy for the preview. Replace with real authored content.</p>
    <p><a href="#">Primary action</a></p>
    <p><a href="#">Secondary action</a></p>
  </div></div>
</div>`;
}

interface LoadedBlock {
	name: string;
	sampleContent: string;
	breakpoints: Breakpoint[];
	figmaUrl?: string;
	placeholder: boolean;
}

/**
 * Load everything the harness needs to render one block: its authored sample
 * (`_<name>.preview.html` or a placeholder), breakpoints and Figma link from
 * `.eds-meta.json`. Returns null when the block has no css/js to preview.
 */
export async function loadBlockForPreview(
	projectRoot: string,
	name: string,
	widths?: string,
): Promise<LoadedBlock | null> {
	const blockDir = path.join(projectRoot, "blocks", name);
	if (
		!existsSync(path.join(blockDir, `${name}.css`)) &&
		!existsSync(path.join(blockDir, `${name}.js`))
	) {
		return null;
	}

	let meta: Record<string, unknown> | null = null;
	const metaPath = path.join(blockDir, ".eds-meta.json");
	if (existsSync(metaPath)) {
		try {
			meta = JSON.parse(await readFile(metaPath, "utf-8"));
		} catch {
			// ignore malformed meta
		}
	}

	const samplePath = path.join(blockDir, `_${name}.preview.html`);
	let sampleContent: string;
	let placeholder = false;
	if (existsSync(samplePath)) {
		sampleContent = await readFile(samplePath, "utf-8");
	} else {
		sampleContent = defaultSample(name);
		placeholder = true;
	}

	return {
		name,
		sampleContent,
		breakpoints: resolveBreakpoints(widths, meta),
		figmaUrl: figmaUrlFromMeta(meta),
		placeholder,
	};
}

/** Route prefix for a block's in-iframe render (served by the frame server). */
export const FRAME_PREFIX = "/__eds_frame/";

/**
 * Start a preview server that serves `/__eds_frame/<name>` (the harness render
 * of any block) on demand. Shared by the gallery, visual tests and content
 * checks. Returns the running server.
 */
export async function startFrameServer(
	projectRoot: string,
	widths: string | undefined,
	port: number,
): ReturnType<typeof startServer> {
	const dynamic = async (urlPath: string) => {
		if (!urlPath.startsWith(FRAME_PREFIX)) return undefined;
		const n = urlPath.slice(FRAME_PREFIX.length);
		if (!/^[a-z0-9-]+$/i.test(n)) return undefined;
		const b = await loadBlockForPreview(projectRoot, n, widths);
		if (!b) return undefined;
		return {
			body: buildInner({
				blockName: n,
				breakpoints: b.breakpoints,
				sampleContent: b.sampleContent,
				frameRoute: FRAME_PREFIX + n,
			}),
			type: "text/html; charset=utf-8",
		};
	};
	return startServer(projectRoot, {}, port, "127.0.0.1", dynamic);
}

/** Content blocks that can be previewed (has css/js, not header/footer), sorted. */
export async function listPreviewableBlocks(projectRoot: string): Promise<string[]> {
	const blocksDir = path.join(projectRoot, "blocks");
	if (!existsSync(blocksDir)) return [];
	const entries = await readdir(blocksDir, { withFileTypes: true });
	const names: string[] = [];
	for (const e of entries) {
		if (!e.isDirectory() || CHROME_BLOCKS.has(e.name)) continue;
		const dir = path.join(blocksDir, e.name);
		if (existsSync(path.join(dir, `${e.name}.css`)) || existsSync(path.join(dir, `${e.name}.js`))) {
			names.push(e.name);
		}
	}
	return names.sort();
}

async function openInBrowser(url: string): Promise<void> {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		const { execa } = await import("execa");
		await execa(cmd, [url], { stdio: "ignore", shell: process.platform === "win32" });
	} catch {
		// Non-fatal — the URL is printed anyway.
	}
}

/** A running preview: its URL and a way to tear it down (server + watcher). */
export interface PreviewHandle {
	url: string;
	close: () => Promise<void>;
}

/**
 * Start the live preview server for a block **without blocking**: boots the
 * HTTP server, installs the live-reload file watcher, opens the browser and
 * prints the usual info, then returns a handle. The caller decides whether to
 * keep running (e.g. `previewBlock` waits for Ctrl+C) or to keep the preview up
 * in the background while doing more work (e.g. the `from-design` refine loop).
 * Returns null if the block can't be previewed.
 */
export async function startPreview(
	name: string,
	options: PreviewOptions = {},
): Promise<PreviewHandle | null> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return null;
	}

	const blockDir = path.join(projectRoot, "blocks", name);
	if (!existsSync(blockDir)) {
		logger.error(`Block "${name}" not found at blocks/${name}/.`);
		process.exitCode = 1;
		return null;
	}
	if (
		!existsSync(path.join(blockDir, `${name}.css`)) &&
		!existsSync(path.join(blockDir, `${name}.js`))
	) {
		logger.error(`Block "${name}" has no ${name}.css / ${name}.js to preview.`);
		process.exitCode = 1;
		return null;
	}

	// header/footer are page chrome, not content blocks: their JS fetches the
	// nav/footer fragment (/nav.plain.html → 404 here) and expects the full page
	// runtime, so they can't render standalone. Warn rather than pretend.
	if (name === "header" || name === "footer") {
		logger.warn(`"${name}" is page chrome, not a content block — it won't render standalone here.`);
		logger.info(
			chalk.dim(
				`  It fetches the ${name === "header" ? "nav" : "footer"} fragment and needs the full page runtime.`,
			),
		);
		logger.info(
			chalk.dim("  Preview a content block instead (e.g. a block generated from a design)."),
		);
	}

	// Load metadata (breakpoints, Figma source) if present.
	let meta: Record<string, unknown> | null = null;
	const metaPath = path.join(blockDir, ".eds-meta.json");
	if (existsSync(metaPath)) {
		try {
			meta = JSON.parse(await readFile(metaPath, "utf-8"));
		} catch {
			// ignore malformed meta
		}
	}

	// Sample authored content: _<name>.preview.html if provided, else a placeholder.
	const samplePath = path.join(blockDir, `_${name}.preview.html`);
	let sampleContent: string;
	let placeholder = false;
	if (existsSync(samplePath)) {
		sampleContent = await readFile(samplePath, "utf-8");
	} else {
		sampleContent = defaultSample(name);
		placeholder = true;
	}

	const breakpoints = resolveBreakpoints(options.widths, meta);
	const figmaUrl = figmaUrlFromMeta(meta);
	const frameRoute = "/__eds_preview_frame";

	const inner = buildInner({ blockName: name, breakpoints, sampleContent, frameRoute });
	const outer = buildOuter({
		blockName: name,
		breakpoints,
		sampleContent,
		figmaUrl,
		frameRoute,
		placeholder,
	});

	const port = Number.parseInt(options.port ?? "8777", 10);
	const server = await startServer(
		projectRoot,
		{
			"/": { body: outer, type: "text/html; charset=utf-8" },
			[frameRoute]: { body: inner, type: "text/html; charset=utf-8" },
		},
		Number.isFinite(port) ? port : 8777,
	);

	logger.logoOnce(ui.logo(`Preview — ${name}`));
	logger.info(ui.heading("Live preview", server.url));
	logger.info(
		ui.statusLine(
			"pass",
			"breakpoints",
			`${breakpoints.map((b) => `${b.width}${b.figma ? "✓" : ""}`).join(", ")}, Full`,
		),
	);
	if (placeholder) {
		logger.info(
			ui.statusLine(
				"warn",
				"content",
				`placeholder — add blocks/${name}/_${name}.preview.html for real content`,
			),
		);
	}
	// Live reload: watch the block folder and push a browser refresh on change.
	let reloadTimer: NodeJS.Timeout | undefined;
	const watcher = watch(blockDir, { recursive: true }, () => {
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => server.reload(), 150);
	});

	logger.info("");
	logger.info(`  ${chalk.bold("➜")}  ${chalk.cyan(server.url)}`);
	logger.info(ui.statusLine("pass", "live reload", "edits to the block refresh the browser"));

	if (options.open !== false) await openInBrowser(server.url);

	return {
		url: server.url,
		close: async () => {
			watcher.close();
			await server.close();
		},
	};
}

/**
 * The `eds block preview` command: start the preview and block until the user
 * stops it with Ctrl+C.
 */
export async function previewBlock(name: string, options: PreviewOptions = {}): Promise<void> {
	const handle = await startPreview(name, options);
	if (!handle) return;

	logger.info(chalk.dim("  Press Ctrl+C to stop.\n"));

	await new Promise<void>((resolve) => {
		const stop = async () => {
			await handle.close();
			resolve();
			process.exit(0);
		};
		process.on("SIGINT", stop);
		process.on("SIGTERM", stop);
	});
}

/**
 * The `eds block preview` command with no block name: a live gallery of every
 * previewable block, each in its own width-honest iframe. Routes are computed
 * per request, so a block generated while the gallery is open shows up on the
 * next reload (the watcher refreshes the browser automatically).
 */
export async function galleryPreview(options: PreviewOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	const FRAME_PREFIX = "/__eds_frame/";
	const dynamic = async (urlPath: string) => {
		if (urlPath === "/") {
			const names = await listPreviewableBlocks(projectRoot);
			const items: GalleryItem[] = [];
			for (const name of names) {
				const b = await loadBlockForPreview(projectRoot, name, options.widths);
				if (b) {
					items.push({
						blockName: name,
						breakpoints: b.breakpoints,
						frameRoute: FRAME_PREFIX + name,
						figmaUrl: b.figmaUrl,
						placeholder: b.placeholder,
					});
				}
			}
			return { body: buildGallery(items), type: "text/html; charset=utf-8" };
		}
		if (urlPath.startsWith(FRAME_PREFIX)) {
			const name = urlPath.slice(FRAME_PREFIX.length);
			if (!/^[a-z0-9-]+$/i.test(name)) return undefined;
			const b = await loadBlockForPreview(projectRoot, name, options.widths);
			if (!b) return undefined;
			const inner = buildInner({
				blockName: name,
				breakpoints: b.breakpoints,
				sampleContent: b.sampleContent,
				frameRoute: FRAME_PREFIX + name,
			});
			return { body: inner, type: "text/html; charset=utf-8" };
		}
		return undefined;
	};

	const port = Number.parseInt(options.port ?? "8777", 10);
	const server = await startServer(
		projectRoot,
		{},
		Number.isFinite(port) ? port : 8777,
		"127.0.0.1",
		dynamic,
	);

	const names = await listPreviewableBlocks(projectRoot);
	logger.logoOnce(ui.logo("Preview — gallery"));
	logger.info(ui.heading("Live gallery", server.url));
	logger.info(
		ui.statusLine(
			names.length ? "pass" : "warn",
			"blocks",
			names.length ? names.join(", ") : "none yet — generate one with eds block from-design",
		),
	);

	// Live reload: watch the whole blocks/ tree — new or edited blocks refresh.
	let reloadTimer: NodeJS.Timeout | undefined;
	const watcher = watch(path.join(projectRoot, "blocks"), { recursive: true }, () => {
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => server.reload(), 150);
	});

	logger.info("");
	logger.info(`  ${chalk.bold("➜")}  ${chalk.cyan(server.url)}`);
	logger.info(ui.statusLine("pass", "live reload", "new & edited blocks refresh the browser"));
	logger.info(chalk.dim("  Press Ctrl+C to stop.\n"));

	if (options.open !== false) await openInBrowser(server.url);

	await new Promise<void>((resolve) => {
		const stop = async () => {
			watcher.close();
			await server.close();
			resolve();
			process.exit(0);
		};
		process.on("SIGINT", stop);
		process.on("SIGTERM", stop);
	});
}
