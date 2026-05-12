import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { kebabCaseRegex } from "../../lib/schemas.js";
import { findProjectRoot } from "../../lib/project.js";
import { logger } from "../../lib/logger.js";

interface CreateBlockOptions {
	withUeModel?: boolean;
}

export async function createBlock(name: string, options: CreateBlockOptions = {}): Promise<void> {
	if (!kebabCaseRegex.test(name)) {
		logger.error(
			`Invalid block name "${name}". Use kebab-case (e.g., "hero-banner", "card-list").`,
		);
		process.exitCode = 1;
		return;
	}

	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error(
			"Not inside an EDS project (no fstab.yaml found). Run this from your project root.",
		);
		process.exitCode = 1;
		return;
	}

	const blocksDir = path.join(projectRoot, "blocks", name);
	if (existsSync(blocksDir)) {
		logger.error(`Block "${name}" already exists at ${blocksDir}`);
		process.exitCode = 1;
		return;
	}

	await mkdir(blocksDir, { recursive: true });

	const jsContent = `export default function decorate(block) {
  // TODO: implement ${name} block
}
`;

	const cssContent = `.${name} {
  /* TODO: style ${name} block */
}
`;

	await writeFile(path.join(blocksDir, `${name}.js`), jsContent);
	await writeFile(path.join(blocksDir, `${name}.css`), cssContent);

	if (options.withUeModel) {
		const modelContent = JSON.stringify(
			{
				id: name,
				fields: [
					{
						component: "text",
						name: "heading",
						label: "Heading",
					},
				],
			},
			null,
			2,
		);
		await writeFile(path.join(blocksDir, `_${name}.json`), modelContent + "\n");
	}

	logger.success(`Block "${name}" created at ${chalk.cyan(path.relative(projectRoot, blocksDir))}`);
}
