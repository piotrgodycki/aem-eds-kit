import { existsSync } from "node:fs";
import path from "node:path";
import type { EdsProject } from "./schemas.js";
import { edsProjectSchema } from "./schemas.js";

/**
 * Files that mark an EDS/AEM project root. `fstab.yaml` is the classic
 * Franklin/Helix mountpoint, but Universal Editor / crosswalk and Document
 * Authoring projects often don't have one - so we also accept the EDS runtime
 * (`scripts/`), the document `head.html`, the UE config, and the crosswalk /
 * query maps. A directory counts as a root if it has ANY of these.
 */
const ROOT_MARKERS = [
	"fstab.yaml",
	"head.html",
	"helix-query.yaml",
	"component-definition.json",
	"paths.json",
	"scripts/scripts.js",
	"scripts/aem.js",
];

/**
 * Walk up from `startDir` looking for an EDS project root - the first ancestor
 * directory that contains any of {@link ROOT_MARKERS}.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | undefined {
	let dir = path.resolve(startDir);
	const { root } = path.parse(dir);

	while (dir !== root) {
		if (ROOT_MARKERS.some((m) => existsSync(path.join(dir, m)))) {
			return dir;
		}
		dir = path.dirname(dir);
	}
	// Also check the filesystem root itself (the loop stops before testing it).
	if (ROOT_MARKERS.some((m) => existsSync(path.join(root, m)))) return root;
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
