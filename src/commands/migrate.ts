import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { findClientlibDir, readClientlibCss } from "../lib/migrate/clientlib.js";
import {
	findDialogFile,
	migratedBlockCss,
	migratedBlockJs,
	migratedModelFile,
	readComponentTitle,
	readDialogFields,
} from "../lib/migrate/component.js";
import type { UEField } from "../lib/migrate/dialog.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

export interface MigrateOptions {
	name?: string;
	yes?: boolean;
	/** Path to the component's clientlib (otherwise auto-detected). */
	clientlib?: string;
}

/** Build the block CSS from clientlib sources, with a header telling the dev to scope it. */
function clientlibBlockCss(blockName: string, css: string, files: string[]): string {
	return `/* Block: ${blockName} */
/* Migrated from the component clientlib: ${files.join(", ")}. */
/* TODO: review selectors and scope them under .${blockName} (and port any LESS/SCSS). */

${css.trim()}
`;
}

const slug = (s: string): string =>
	s
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** Flatten the field tree into aligned preview lines (tabs/containers indented). */
function previewFields(fields: UEField[], depth = 0): string[] {
	const lines: string[] = [];
	for (const f of fields) {
		const indent = "  ".repeat(depth);
		if (f.component === "tab") {
			lines.push(`${indent}${ui.brand.blue("▸")} ${f.label ?? f.name}`);
		} else {
			const opts = f.options?.length ? ` (${f.options.length} options)` : "";
			const multi = f.multi ? " ·multi" : "";
			const label = f.label ? `- ${f.label}` : "";
			lines.push(`${indent}${ui.brand.accent(f.component)}${multi}  ${f.name}${opts}  ${label}`);
			if (f.fields?.length) lines.push(...previewFields(f.fields, depth + 1));
		}
	}
	return lines;
}

function countLeaves(fields: UEField[]): number {
	let n = 0;
	for (const f of fields) {
		if (f.component === "tab") continue;
		n += 1;
		if (f.fields) n += countLeaves(f.fields);
	}
	return n;
}

/**
 * `eds migrate component <dir>` - migrate a classic AEM component's Touch UI
 * dialog into an EDS block skeleton + Universal Editor model. Phase 1:
 * deterministic (dialog → fields), no network, no agent. CSS/HTML come later.
 */
export async function migrateComponent(
	dirArg: string | undefined,
	options: MigrateOptions = {},
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Migrate component");

	const { input, confirm } = await import("@inquirer/prompts");
	const interactive = !options.yes;

	let componentDir = dirArg;
	if (!componentDir && interactive) {
		componentDir = await input({
			message: "Path to the classic component folder",
			validate: (v) => existsSync(v.trim()) || "Folder not found",
		});
	}
	if (!componentDir) {
		logger.error("Provide the path to the classic component folder.");
		process.exitCode = 1;
		return;
	}
	componentDir = path.resolve(componentDir.trim());

	if (!findDialogFile(componentDir)) {
		logger.error(`No Touch UI dialog (_cq_dialog/.content.xml) found in ${componentDir}.`);
		process.exitCode = 1;
		return;
	}

	const parsed = await readDialogFields(componentDir);
	if (!parsed || parsed.fields.length === 0) {
		logger.warn("Dialog found but no mappable fields were detected.");
		if (parsed?.unmapped.length)
			logger.info(`Unmapped resourceTypes: ${parsed.unmapped.join(", ")}`);
		process.exitCode = 1;
		return;
	}

	const title = (await readComponentTitle(componentDir)) ?? path.basename(componentDir);
	const blockName =
		(options.name && slug(options.name)) ||
		(interactive
			? slug(await input({ message: "Block name", default: slug(title) }))
			: slug(title));

	// Preview.
	logger.info(ui.heading("Mapped fields", `${countLeaves(parsed.fields)} from dialog`));
	for (const line of previewFields(parsed.fields)) logger.info(`  ${line}`);
	if (parsed.unmapped.length) {
		logger.info("");
		logger.warn(`Skipped (unrecognised): ${parsed.unmapped.join(", ")}`);
	}
	logger.info("");

	if (interactive) {
		const go = await confirm({ message: `Generate block "${blockName}"?`, default: true });
		if (!go) {
			logger.info("Cancelled.");
			return;
		}
	}

	const blockDir = path.join(projectRoot, "blocks", blockName);
	if (existsSync(blockDir)) {
		logger.error(
			`Block "${blockName}" already exists at blocks/${blockName}. Use --name to pick another.`,
		);
		process.exitCode = 1;
		return;
	}
	// CSS: pull it off the component's clientlib if we can find one, else an
	// empty scoped stub.
	const clibDir = options.clientlib
		? path.resolve(options.clientlib.trim())
		: await findClientlibDir(componentDir);
	let cssContent = migratedBlockCss(blockName);
	let cssMessage = "empty - add styles from clientlib / rendered CSS";
	let preprocessedNote: string[] = [];
	if (clibDir && existsSync(clibDir)) {
		const lib = await readClientlibCss(clibDir);
		if (lib.css.trim()) {
			cssContent = clientlibBlockCss(blockName, lib.css, lib.files);
			cssMessage = `from clientlib (${lib.files.length} file(s)) - review & scope`;
		}
		preprocessedNote = lib.preprocessed;
	}

	await mkdir(blockDir, { recursive: true });
	await writeFile(
		path.join(blockDir, `${blockName}.js`),
		migratedBlockJs(blockName, parsed.fields),
	);
	await writeFile(path.join(blockDir, `${blockName}.css`), cssContent);
	await writeFile(
		path.join(blockDir, `_${blockName}.json`),
		migratedModelFile(blockName, title, parsed.fields),
	);

	logger.info(ui.heading("Created"));
	const files = [`${blockName}.js`, `${blockName}.css`, `_${blockName}.json`];
	const w = ui.columnWidth(files);
	logger.info(ui.accentLine(`${blockName}.js`, "decorator stub (port HTL logic)", w));
	logger.info(ui.accentLine(`${blockName}.css`, cssMessage, w));
	logger.info(ui.accentLine(`_${blockName}.json`, "Universal Editor model", w));
	if (preprocessedNote.length) {
		logger.info("");
		logger.warn(`LESS/SCSS found (needs a build, not copied): ${preprocessedNote.join(", ")}`);
	}
	logger.info("");

	if (interactive) {
		const addTracking = await confirm({
			message: "Instrument this block for analytics (dataLayer)?",
			default: false,
		});
		if (addTracking) {
			const { trackBlock } = await import("./track.js");
			await trackBlock(blockName, {});
		}
	}

	logger.info(
		ui.box([`"${blockName}" migrated. Next: add CSS, then \`eds block preview ${blockName}\``]),
	);
}
