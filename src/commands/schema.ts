import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { SCHEMA_TYPES, injectJsonLd, schemaTypeById } from "../lib/schema/jsonld.js";
import * as ui from "../lib/ui.js";

export interface SchemaOptions {
	/** schema.org type id (e.g. Article, FAQPage). Prompted when omitted. */
	type?: string;
	yes?: boolean;
}

/**
 * `eds schema block <name>` - inject a JSON-LD (schema.org) builder into a
 * block's `decorate()`, appending structured data to the document head.
 */
export async function schemaBlock(blockName: string, options: SchemaOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Schema - JSON-LD"));

	const jsPath = path.join(projectRoot, "blocks", blockName, `${blockName}.js`);
	if (!existsSync(jsPath)) {
		logger.error(`Block "${blockName}" not found (no blocks/${blockName}/${blockName}.js).`);
		process.exitCode = 1;
		return;
	}

	let typeId = options.type;
	if (!typeId && !options.yes) {
		const { select } = await import("@inquirer/prompts");
		typeId = await select({
			message: "Which schema.org type?",
			choices: SCHEMA_TYPES.map((t) => ({ name: `${t.id} - ${t.label}`, value: t.id })),
		});
	}
	const type = typeId ? schemaTypeById(typeId) : undefined;
	if (!type) {
		logger.error(
			`Unknown schema type "${typeId}". Options: ${SCHEMA_TYPES.map((t) => t.id).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	const res = injectJsonLd(await readFile(jsPath, "utf-8"), type);
	if (!res.changed) {
		logger.warn(`Not added: ${res.reason}.`);
		return;
	}
	await writeFile(jsPath, res.js);

	logger.info(ui.heading("JSON-LD added"));
	logger.info(ui.accentLine(`blocks/${blockName}/${blockName}.js`, `${type.id} (${type.label})`));
	logger.info("");
	logger.info(
		chalk.dim(
			"  Review the generated object - some fields are heuristic or TODO. Validate at search.google.com/test/rich-results.",
		),
	);
}
