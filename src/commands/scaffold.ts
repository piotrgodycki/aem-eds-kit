import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import {
	DEFAULT_CONTENT_DEFINITIONS,
	DEFAULT_CONTENT_MODELS,
	FIELD_REFERENCE_CSS,
	FIELD_REFERENCE_JS,
	fieldReferenceModelFile,
	mergeById,
	mergeDefinitions,
	mergeSectionFilter,
} from "../lib/scaffold/ue.js";
import * as ui from "../lib/ui.js";

// biome-ignore lint/suspicious/noExplicitAny: config JSON is free-form
type Json = any;

async function readJson(file: string): Promise<Json | null> {
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(await readFile(file, "utf-8"));
	} catch {
		return null;
	}
}

async function writeJson(file: string, data: Json): Promise<void> {
	await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * `eds scaffold ue` - write the default-content UE components and a
 * field-reference block (every field type + a multifield), merging into any
 * existing component-definition/models/filters.
 */
export async function scaffoldUe(): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	logger.info(ui.logo("Scaffold - Universal Editor"));

	const created: string[] = [];

	// 1. field-reference block
	const blockDir = path.join(projectRoot, "blocks", "field-reference");
	await mkdir(blockDir, { recursive: true });
	await writeFile(path.join(blockDir, "field-reference.js"), FIELD_REFERENCE_JS);
	await writeFile(path.join(blockDir, "field-reference.css"), FIELD_REFERENCE_CSS);
	await writeFile(path.join(blockDir, "_field-reference.json"), fieldReferenceModelFile());
	created.push("blocks/field-reference/ (all 17 fields + multifield)");

	// 2. merge the three UE config files
	const defFile = path.join(projectRoot, "component-definition.json");
	const modelsFile = path.join(projectRoot, "component-models.json");
	const filtersFile = path.join(projectRoot, "component-filters.json");

	const blockDefs = [
		{
			title: "Field Reference",
			id: "field-reference",
			plugins: {
				xwalk: {
					page: {
						resourceType: "core/franklin/components/block/v1/block",
						template: { name: "Field Reference", model: "field-reference" },
					},
				},
			},
		},
	];

	const definitions = mergeDefinitions(
		await readJson(defFile),
		DEFAULT_CONTENT_DEFINITIONS,
		blockDefs,
	);
	await writeJson(defFile, definitions);
	created.push("component-definition.json (default content + field-reference)");

	const existingModels: Json[] = (await readJson(modelsFile)) ?? [];
	const fieldRefModel = JSON.parse(fieldReferenceModelFile()).models[0];
	const models = mergeById(existingModels, [...DEFAULT_CONTENT_MODELS, fieldRefModel]);
	await writeJson(modelsFile, models);
	created.push("component-models.json (title / image / button / field-reference)");

	const filters = mergeSectionFilter(await readJson(filtersFile), ["field-reference"]);
	await writeJson(filtersFile, filters);
	created.push("component-filters.json (section filter)");

	logger.info(ui.heading("Created / merged"));
	const names = created.map((c) => c.split(" ")[0]);
	const w = ui.columnWidth(names);
	for (const c of created) {
		const [name, ...rest] = c.split(" ");
		logger.info(ui.accentLine(name, rest.join(" ").replace(/^\((.*)\)$/, "$1"), w));
	}
	logger.info("");
	logger.info(ui.box(["Universal Editor scaffold ready"]));
}

/** Interactive scaffold picker (`eds scaffold` with no subcommand). */
export async function scaffoldInteractive(): Promise<void> {
	const { select } = await import("@inquirer/prompts");
	logger.info(ui.logo("Scaffold"));
	const what = await select({
		message: "What do you want to scaffold?",
		choices: [
			{
				name: "Universal Editor config + field-reference (all 17 field types)",
				value: "ue",
			},
		],
	});
	if (what === "ue") await scaffoldUe();
}
