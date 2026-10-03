import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import * as ui from "../../lib/ui.js";

interface BlockInfo {
	name: string;
	hasJs: boolean;
	hasCss: boolean;
	hasUeModel: boolean;
	figmaSource?: {
		fileKey: string;
		nodeId?: string;
		lastSyncedAt: string;
	};
}

interface ListOptions {
	json?: boolean;
}

export async function listBlocks(options: ListOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	const blocksDir = path.join(projectRoot, "blocks");
	if (!existsSync(blocksDir)) {
		logger.info("No blocks/ directory found.");
		return;
	}

	const entries = await readdir(blocksDir, { withFileTypes: true });
	const blocks: BlockInfo[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const name = entry.name;
		const blockDir = path.join(blocksDir, name);

		const info: BlockInfo = {
			name,
			hasJs: existsSync(path.join(blockDir, `${name}.js`)),
			hasCss: existsSync(path.join(blockDir, `${name}.css`)),
			hasUeModel: existsSync(path.join(blockDir, `_${name}.json`)),
		};

		const metaFile = path.join(blockDir, ".eds-meta.json");
		if (existsSync(metaFile)) {
			try {
				const meta = JSON.parse(await readFile(metaFile, "utf-8"));
				info.figmaSource = {
					fileKey: meta.figmaFileKey,
					nodeId: meta.figmaNodeId,
					lastSyncedAt: meta.lastSyncedAt,
				};
			} catch {
				// skip invalid meta
			}
		}

		blocks.push(info);
	}

	if (options.json) {
		console.log(JSON.stringify(blocks, null, 2));
		return;
	}

	if (blocks.length === 0) {
		logger.info("No blocks found.");
		return;
	}

	logger.info(ui.heading("Blocks", `${blocks.length} in project`));

	const nameWidth = ui.columnWidth(blocks.map((b) => b.name));
	for (const b of blocks) {
		const badges = [
			b.hasJs ? ui.brand.ok("js") : chalk.dim.strikethrough("js"),
			b.hasCss ? ui.brand.ok("css") : chalk.dim.strikethrough("css"),
		];
		if (b.hasUeModel) badges.push(ui.brand.spectrum("ue-model"));
		if (b.figmaSource) badges.push(`${ui.icon.figma} ${ui.brand.figmaPurple("figma")}`);

		const name = ui.padEndVisible(chalk.bold(b.name), nameWidth);
		logger.info(`  ${name}  ${chalk.dim("[")}${badges.join(" ")}${chalk.dim("]")}`);

		if (b.figmaSource) {
			const synced = new Date(b.figmaSource.lastSyncedAt).toLocaleDateString();
			logger.info(
				`  ${" ".repeat(nameWidth)}  ${ui.icon.arrow} ${chalk.dim(
					`figma:${b.figmaSource.fileKey} · synced ${synced}`,
				)}`,
			);
		}
	}

	logger.info("");
}
