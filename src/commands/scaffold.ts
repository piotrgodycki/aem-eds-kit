import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { type BlockTemplate, STANDARD_BLOCKS, blockById } from "../lib/scaffold/blocks.js";
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

/**
 * `eds scaffold blocks [names...]` - scaffold standard Block Collection blocks
 * (hero, cards, columns, accordion, embed), each with JS/CSS + a distributed
 * `_<name>.json` UE model, and register them in the central `section` filter.
 */
export async function scaffoldBlocks(names?: string[]): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	logger.info(ui.logo("Scaffold — standard blocks"));

	let selected: BlockTemplate[];
	if (names?.length) {
		selected = names.map((n) => blockById(n.trim())).filter((b): b is BlockTemplate => !!b);
		const unknown = names.filter((n) => !blockById(n.trim()));
		if (unknown.length) {
			logger.warn(
				`Unknown block(s): ${unknown.join(", ")}. Available: ${STANDARD_BLOCKS.map((b) => b.id).join(", ")}`,
			);
		}
	} else {
		selected = STANDARD_BLOCKS;
	}

	const createdIds: string[] = [];
	const skipped: string[] = [];
	for (const b of selected) {
		const dir = path.join(projectRoot, "blocks", b.id);
		if (existsSync(dir)) {
			skipped.push(b.id);
			continue;
		}
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, `${b.id}.js`), b.js);
		await writeFile(path.join(dir, `${b.id}.css`), b.css);
		await writeFile(path.join(dir, `_${b.id}.json`), b.model);
		createdIds.push(b.id);
	}

	const filtersFile = path.join(projectRoot, "component-filters.json");
	const filters = mergeSectionFilter(
		await readJson(filtersFile),
		selected.map((b) => b.id),
	);
	await writeJson(filtersFile, filters);

	logger.info(ui.heading("Blocks"));
	const w = ui.columnWidth([...createdIds, ...skipped, "component-filters"]);
	for (const id of createdIds) logger.info(ui.accentLine(id, "created", w));
	for (const id of skipped) logger.info(ui.statusLine("warn", id, "already exists — skipped", w));
	logger.info("");
	logger.info(ui.box([`${createdIds.length} block(s) scaffolded + registered`]));
}

/** Interactive scaffold picker (`eds scaffold` with no subcommand). */
export async function scaffoldInteractive(): Promise<void> {
	const { select, checkbox } = await import("@inquirer/prompts");
	logger.info(ui.logo("Scaffold"));
	const what = await select({
		message: "What do you want to scaffold?",
		choices: [
			{ name: "Universal Editor config + field-reference (all 17 field types)", value: "ue" },
			{ name: "Standard blocks (hero, cards, columns, accordion, embed)", value: "blocks" },
			{ name: "Both", value: "both" },
		],
	});
	if (what === "ue" || what === "both") await scaffoldUe();
	if (what === "blocks" || what === "both") {
		const picked = await checkbox({
			message: "Which blocks?",
			choices: STANDARD_BLOCKS.map((b) => ({ name: b.title, value: b.id, checked: true })),
		});
		await scaffoldBlocks(picked);
	}
}
