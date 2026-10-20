import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { loadConfig } from "../../lib/config.js";
import { acquireRestSlot, restCallLogPath } from "../../lib/figma/pacer.js";
import { fetchFigmaImage } from "../../lib/figma/rest.js";
import { logger } from "../../lib/logger.js";
import {
	baselineDir,
	baselinePath,
	compareOverlap,
	comparePng,
	formatRatio,
	screenshotRoute,
} from "../../lib/preview/visual.js";
import { findProjectRoot } from "../../lib/project.js";
import * as ui from "../../lib/ui.js";
import {
	FRAME_PREFIX,
	listPreviewableBlocks,
	loadBlockForPreview,
	startFrameServer,
} from "./preview.js";

interface TestOptions {
	widths?: string;
	update?: boolean;
	/** Max allowed changed-pixel ratio before a breakpoint fails (default 0.01 = 1%). */
	threshold?: string;
	port?: string;
	/** Compare the rendered block against the Figma design image (approximate). */
	design?: boolean;
}

const frameUrl = (base: string, name: string) => `${base}${FRAME_PREFIX.slice(1)}${name}`;
/** The block element in the preview frame - screenshots capture just the block. */
const blockSelector = (name: string) => `body > .${name}`;
/** Height of the old full-page baselines (the preview viewport). */
const LEGACY_VIEWPORT_HEIGHT = 900;

/**
 * Visual-regression test: screenshot each block at each breakpoint and diff it
 * against a committed baseline (`blocks/<name>/__snapshots__/`). No name → all
 * content blocks. `--update` (re)writes baselines; diffs for failures are
 * written under `tmp/eds-cli/visual-diff/`. Exits non-zero on any change.
 */
export async function visualTest(
	name: string | undefined,
	options: TestOptions = {},
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	if (options.design) {
		await designDiff(projectRoot, name, options);
		return;
	}

	const names = name ? [name] : await listPreviewableBlocks(projectRoot);
	if (!names.length) {
		logger.warn("No previewable blocks to test.");
		return;
	}

	const port = Number.parseInt(options.port ?? "8788", 10);
	const server = await startFrameServer(
		projectRoot,
		options.widths,
		Number.isFinite(port) ? port : 8788,
	);
	const threshold = Number.parseFloat(options.threshold ?? "0.01");
	const diffOut = path.join(projectRoot, "tmp", "eds-cli", "visual-diff");

	logger.logoOnce(ui.logo("Visual test"));
	let passed = 0;
	let changed = 0;
	let created = 0;
	let updated = 0;

	try {
		for (const n of names) {
			const b = await loadBlockForPreview(projectRoot, n, options.widths);
			if (!b) continue;
			logger.info(ui.heading(n));
			for (const bp of b.breakpoints) {
				const shot = await screenshotRoute(frameUrl(server.url, n), bp.width, blockSelector(n));
				const base = baselinePath(projectRoot, n, bp.width);
				const existed = existsSync(base);

				if (options.update || !existed) {
					await mkdir(baselineDir(projectRoot, n), { recursive: true });
					await writeFile(base, shot);
					if (existed) {
						updated++;
						logger.info(ui.statusLine("pass", `${bp.width}px`, "baseline updated"));
					} else {
						created++;
						logger.info(ui.statusLine("pass", `${bp.width}px`, "baseline created"));
					}
					continue;
				}

				const res = await comparePng(await readFile(base), shot);
				if (res.sizeMismatch) {
					changed++;
					// Baselines made before block-only screenshots are full-page (≥ the
					// viewport); say so instead of reporting a real size change.
					const legacy =
						res.height === LEGACY_VIEWPORT_HEIGHT && (res.otherHeight ?? 0) < res.height;
					logger.info(
						ui.statusLine(
							"fail",
							`${bp.width}px`,
							legacy
								? `baseline is an older full-page shot (${res.width}×${res.height}) — re-run with --update`
								: `size changed ${res.width}×${res.height} → ${res.otherWidth}×${res.otherHeight}`,
						),
					);
					continue;
				}
				if (res.ratio > threshold) {
					changed++;
					await mkdir(diffOut, { recursive: true });
					const dp = path.join(diffOut, `${n}-${bp.width}.diff.png`);
					if (res.diffPng) await writeFile(dp, res.diffPng);
					logger.info(
						ui.statusLine(
							"fail",
							`${bp.width}px`,
							`${formatRatio(res.ratio)} changed → ${path.relative(projectRoot, dp)}`,
						),
					);
				} else {
					passed++;
					logger.info(
						ui.statusLine(
							"pass",
							`${bp.width}px`,
							res.ratio > 0
								? `${formatRatio(res.ratio)} (within ${formatRatio(threshold)})`
								: "identical",
						),
					);
				}
			}
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
		return;
	} finally {
		await server.close();
	}

	logger.info("");
	logger.info(
		`${chalk.green(`${passed} passed`)} · ${chalk.yellow(`${changed} changed`)} · ${created} new · ${updated} updated`,
	);
	if (changed > 0) {
		logger.warn(
			`${changed} visual change(s). Review the diff PNGs in tmp/eds-cli/visual-diff/, then re-run with --update to accept.`,
		);
		process.exitCode = 1;
	}
}

/**
 * Approximate design↔render comparison: render the block at the design frame
 * width, fetch the Figma node as a PNG (REST), and diff the common region. The
 * design has real content and a fixed frame while the block uses placeholders
 * and is responsive, so treat the ratio as a guide, not a gate - the two images
 * are saved for a side-by-side look.
 */
async function designDiff(
	projectRoot: string,
	name: string | undefined,
	options: TestOptions,
): Promise<void> {
	if (!name) {
		logger.error("Design diff needs a block name: eds block test <name> --design");
		process.exitCode = 1;
		return;
	}
	const b = await loadBlockForPreview(projectRoot, name, options.widths);
	if (!b) {
		logger.error(`Block "${name}" has no css/js to render.`);
		process.exitCode = 1;
		return;
	}

	// Figma source from the block's metadata (written by from-design).
	let fileKey: string | undefined;
	let nodeId: string | undefined;
	const metaPath = path.join(projectRoot, "blocks", name, ".eds-meta.json");
	if (existsSync(metaPath)) {
		try {
			const m = JSON.parse(await readFile(metaPath, "utf-8")) as {
				figmaFileKey?: string;
				figmaNodeId?: string;
			};
			fileKey = m.figmaFileKey ?? undefined;
			nodeId = m.figmaNodeId ?? undefined;
		} catch {
			// ignore
		}
	}
	if (!fileKey || !nodeId) {
		logger.error(`"${name}" has no Figma source in .eds-meta.json — can't fetch the design image.`);
		process.exitCode = 1;
		return;
	}

	const config = await loadConfig(projectRoot);
	const token = config.figma?.token ?? process.env.FIGMA_TOKEN ?? process.env.FIGMA_PAT;
	if (!token) {
		logger.error(
			"Design diff needs a Figma token (FIGMA_TOKEN or figma.token) to render the node.",
		);
		process.exitCode = 1;
		return;
	}

	// Render at the widest Figma-referenced breakpoint (else the widest overall).
	const figmaBps = b.breakpoints.filter((x) => x.figma);
	const width = (figmaBps.length ? figmaBps : b.breakpoints).reduce(
		(m, x) => (x.width > m.width ? x : m),
		b.breakpoints[0],
	).width;

	const port = Number.parseInt(options.port ?? "8788", 10);
	const server = await startFrameServer(
		projectRoot,
		options.widths,
		Number.isFinite(port) ? port : 8788,
	);
	logger.logoOnce(ui.logo("Design ↔ render"));
	logger.info(ui.heading(name, `${width}px`));

	try {
		const blockShot = await screenshotRoute(frameUrl(server.url, name), width, blockSelector(name));
		logger.info(ui.statusLine("pass", "render", "block screenshot captured"));
		const designPng = await fetchFigmaImage({
			fileKey,
			nodeId,
			token,
			scale: 1,
			pace: () =>
				acquireRestSlot({
					logPath: restCallLogPath(projectRoot),
					perMinute: config.figma?.restPerMinute,
					onWait: (ms) =>
						logger.info(
							ui.statusLine(
								"warn",
								"design",
								`waiting ${Math.ceil(ms / 1000)} s for a Figma REST slot`,
							),
						),
				}),
		});
		logger.info(ui.statusLine("pass", "design", "Figma image fetched (REST)"));

		const res = await compareOverlap(designPng, blockShot);
		const outDir = path.join(projectRoot, "tmp", "eds-cli", "visual-diff");
		await mkdir(outDir, { recursive: true });
		await writeFile(path.join(outDir, `${name}-design.png`), designPng);
		await writeFile(path.join(outDir, `${name}-render.png`), blockShot);
		if (res.diffPng) await writeFile(path.join(outDir, `${name}-design-diff.png`), res.diffPng);

		logger.info(
			ui.statusLine(
				"warn",
				"diff",
				`~${formatRatio(res.ratio)} different over ${res.width}×${res.height} (approximate)`,
			),
		);
		logger.info("");
		logger.info(
			chalk.dim(
				`  Saved design / render / diff to ${path.relative(projectRoot, outDir)}/${name}-*.png — compare side by side.`,
			),
		);
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
	} finally {
		await server.close();
	}
}
