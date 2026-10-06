import { existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../../lib/logger.js";
import { type Breakpoint, buildInner, buildOuter } from "../../lib/preview/harness.js";
import { startServer } from "../../lib/preview/server.js";
import { findProjectRoot } from "../../lib/project.js";
import * as ui from "../../lib/ui.js";

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
				figma: b.source === "figma",
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

export async function previewBlock(name: string, options: PreviewOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	const blockDir = path.join(projectRoot, "blocks", name);
	if (!existsSync(blockDir)) {
		logger.error(`Block "${name}" not found at blocks/${name}/.`);
		process.exitCode = 1;
		return;
	}
	if (
		!existsSync(path.join(blockDir, `${name}.css`)) &&
		!existsSync(path.join(blockDir, `${name}.js`))
	) {
		logger.error(`Block "${name}" has no ${name}.css / ${name}.js to preview.`);
		process.exitCode = 1;
		return;
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
	logger.info(chalk.dim("  Press Ctrl+C to stop.\n"));

	if (options.open !== false) await openInBrowser(server.url);

	// Keep running until interrupted.
	const stop = async () => {
		watcher.close();
		await server.close();
		process.exit(0);
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
}
