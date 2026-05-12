import { existsSync } from "node:fs";
import path from "node:path";
import type { EdsProject } from "./schemas.js";
import { edsProjectSchema } from "./schemas.js";

const EDS_MARKERS = ["fstab.yaml", "head.html"];

/**
 * Walk up from `startDir` looking for an EDS project root.
 * A directory is an EDS root if it contains fstab.yaml.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | undefined {
	let dir = path.resolve(startDir);
	const { root } = path.parse(dir);

	while (dir !== root) {
		if (existsSync(path.join(dir, "fstab.yaml"))) {
			return dir;
		}
		dir = path.dirname(dir);
	}
	return undefined;
}

export function detectProject(rootDir: string): EdsProject {
	return edsProjectSchema.parse({
		root: rootDir,
		hasFstab: existsSync(path.join(rootDir, "fstab.yaml")),
		hasBlocks: existsSync(path.join(rootDir, "blocks")),
		hasHeadHtml: existsSync(path.join(rootDir, "head.html")),
	});
}
