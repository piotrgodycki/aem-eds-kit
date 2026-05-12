import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { findProjectRoot } from "../../lib/project.js";
import { logger } from "../../lib/logger.js";

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

	logger.info(chalk.bold(`\nBlocks (${blocks.length}):\n`));

	for (const b of blocks) {
		const parts = [
			b.hasJs ? chalk.green("js") : chalk.red("js"),
			b.hasCss ? chalk.green("css") : chalk.red("css"),
		];
		if (b.hasUeModel) parts.push(chalk.blue("ue-model"));
		if (b.figmaSource) parts.push(chalk.magenta("figma"));

		logger.info(`  ${chalk.cyan(b.name)}  [${parts.join(" ")}]`);

		if (b.figmaSource) {
			const synced = new Date(b.figmaSource.lastSyncedAt).toLocaleDateString();
			logger.info(chalk.dim(`    ↳ figma:${b.figmaSource.fileKey} synced ${synced}`));
		}
	}

	logger.info("");
}
