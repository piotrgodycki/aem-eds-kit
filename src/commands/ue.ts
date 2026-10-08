import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { UE_CONFIG_FILES, assessReadiness, hasAemConnection, modelIds } from "../lib/ue/check.js";
import { editorLink, parseRemote, previewHost } from "../lib/ue/link.js";
import * as ui from "../lib/ui.js";

export interface UeOpenOptions {
	path?: string;
	org?: string;
	ref?: string;
	url?: string;
	open?: boolean;
}

async function readJson(file: string): Promise<unknown> {
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(await readFile(file, "utf-8"));
	} catch {
		return null;
	}
}

/** Block directories under `blocks/`, each with whether a `_<name>.json` exists. */
async function scanBlocks(root: string): Promise<{ name: string; hasModelFile: boolean }[]> {
	const blocksDir = path.join(root, "blocks");
	if (!existsSync(blocksDir)) return [];
	const entries = await readdir(blocksDir, { withFileTypes: true });
	return entries
		.filter((e) => e.isDirectory())
		.map((e) => ({
			name: e.name,
			hasModelFile: existsSync(path.join(blocksDir, e.name, `_${e.name}.json`)),
		}));
}

async function openUrl(url: string): Promise<void> {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		const { execa } = await import("execa");
		await execa(cmd, [url], { stdio: "ignore" });
	} catch {
		// non-fatal - the link is printed anyway
	}
}

async function gitRemote(root: string): Promise<string | null> {
	try {
		const { execa } = await import("execa");
		const res = await execa("git", ["remote", "get-url", "origin"], { cwd: root });
		return res.stdout.trim() || null;
	} catch {
		return null;
	}
}

/** `eds ue check` - report Universal Editor readiness (offline, no network). */
export async function ueCheck(): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Universal Editor - readiness"));

	const configPresent: Record<string, boolean> = {};
	for (const f of UE_CONFIG_FILES) configPresent[f] = existsSync(path.join(root, f));

	const componentModels = await readJson(path.join(root, "component-models.json"));
	const blocks = await scanBlocks(root);
	const { isUeProject, blocks: blockReadiness } = assessReadiness({
		configPresent,
		blocks,
		modelIds: modelIds(componentModels),
	});

	// Config files
	logger.info(ui.heading("Universal Editor config"));
	const names = [...UE_CONFIG_FILES];
	const w = ui.columnWidth(names);
	for (const f of names) {
		logger.info(ui.statusLine(configPresent[f] ? "pass" : "fail", f, undefined, w));
	}

	if (!isUeProject) {
		logger.info("");
		logger.warn(
			"This doesn't look like a Universal Editor (crosswalk) project - run `eds scaffold ue` first.",
		);
		process.exitCode = 1;
		return;
	}

	// head.html connection (informational - usually only needed for local editing)
	const headFile = path.join(root, "head.html");
	if (existsSync(headFile)) {
		const connected = hasAemConnection(await readFile(headFile, "utf-8"));
		logger.info(
			ui.statusLine(
				connected ? "pass" : "info",
				"head.html",
				connected ? "aemconnection present" : "no aemconnection (fine for cloud author)",
			),
		);
	}

	// Blocks
	logger.info(ui.heading("Blocks", `${blockReadiness.length} found`));
	if (blockReadiness.length === 0) {
		logger.info(chalk.dim("  No blocks yet."));
	} else {
		const bw = ui.columnWidth(blockReadiness.map((b) => b.name));
		for (const b of blockReadiness) {
			logger.info(ui.statusLine(b.editable ? "pass" : "warn", b.name, b.reason, bw));
		}
	}

	const editable = blockReadiness.filter((b) => b.editable).length;
	const notEditable = blockReadiness.length - editable;
	logger.info("");
	logger.info(ui.summary({ pass: editable, warn: notEditable }));
	logger.info(chalk.dim("  Open a page in the editor with `eds ue open <path>`."));
}

/** `eds ue open [path]` - build and open the Universal Editor deep link. */
export async function ueOpen(
	pagePath: string | undefined,
	options: UeOpenOptions = {},
): Promise<void> {
	const root = findProjectRoot() ?? process.cwd();
	const pPath = pagePath ?? options.path ?? "/";

	let host = options.url;
	if (!host) {
		const remote = await gitRemote(root);
		const parsed = remote ? parseRemote(remote) : null;
		if (!parsed) {
			logger.error("Couldn't determine the preview host from git.");
			logger.info(
				chalk.dim(
					"  Pass it explicitly: `eds ue open <path> --url main--<repo>--<owner>.aem.page`",
				),
			);
			process.exitCode = 1;
			return;
		}
		host = previewHost(parsed.owner, parsed.repo, options.ref ?? "main");
	}

	const link = editorLink({ host, path: pPath, org: options.org });

	logger.info(ui.heading("Universal Editor"));
	logger.info(ui.accentLine("page", `${host}${pPath.startsWith("/") ? "" : "/"}${pPath}`));
	logger.info(ui.accentLine("open", link));

	if (options.open !== false) await openUrl(link);
	else logger.info(chalk.dim("  (use without --no-open to launch the browser)"));
}
