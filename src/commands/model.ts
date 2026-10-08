import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import type { Field } from "../lib/model/helpers.js";
import { PARTIALS, partialById } from "../lib/model/partials.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

export interface ModelAddOptions {
	yes?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: UE model JSON is free-form
type Json = any;

/**
 * `eds model add <block> [partials...]` - compose reusable field groups
 * (partials) into a block's Universal Editor model (`_<block>.json`). Fields are
 * added by name, so re-running never duplicates. Deterministic, no agent.
 */
export async function modelAdd(
	blockArg: string | undefined,
	partialArgs: string[],
	options: ModelAddOptions = {},
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	logger.logoOnce(ui.logo("Model - add partials"));

	const { select, checkbox } = await import("@inquirer/prompts");
	const interactive = !options.yes;

	// Resolve the block + its model file.
	let blockName = blockArg;
	if (!blockName && interactive) {
		const { readdir } = await import("node:fs/promises");
		const blocksDir = path.join(projectRoot, "blocks");
		const dirs = existsSync(blocksDir)
			? (await readdir(blocksDir, { withFileTypes: true }))
					.filter(
						(e) => e.isDirectory() && existsSync(path.join(blocksDir, e.name, `_${e.name}.json`)),
					)
					.map((e) => e.name)
			: [];
		if (dirs.length === 0) {
			logger.error("No block with a _<name>.json model found. Create one with `eds block create`.");
			process.exitCode = 1;
			return;
		}
		blockName = await select({
			message: "Which block's model?",
			choices: dirs.map((d) => ({ name: d, value: d })),
		});
	}
	if (!blockName) {
		logger.error("Provide a block name.");
		process.exitCode = 1;
		return;
	}

	const modelFile = path.join(projectRoot, "blocks", blockName, `_${blockName}.json`);
	if (!existsSync(modelFile)) {
		logger.error(`No model at blocks/${blockName}/_${blockName}.json. Create the block first.`);
		process.exitCode = 1;
		return;
	}

	// Resolve which partials to add.
	let ids = partialArgs;
	if (ids.length === 0 && interactive) {
		ids = await checkbox({
			message: "Which partials to add?",
			choices: PARTIALS.map((p) => ({ name: p.label, value: p.id })),
		});
	}
	const partials = ids.map((id) => partialById(id.trim())).filter((p) => !!p);
	const unknown = ids.filter((id) => !partialById(id.trim()));
	if (unknown.length) {
		logger.warn(
			`Unknown partial(s): ${unknown.join(", ")}. Available: ${PARTIALS.map((p) => p.id).join(", ")}`,
		);
	}
	if (partials.length === 0) {
		logger.info("Nothing to add.");
		return;
	}

	// Load the model and target the block's model entry.
	let model: Json;
	try {
		model = JSON.parse(await readFile(modelFile, "utf-8"));
	} catch {
		logger.error(`Could not parse ${modelFile}.`);
		process.exitCode = 1;
		return;
	}
	const models: Json[] = Array.isArray(model.models) ? model.models : [];
	const target = models.find((m) => m.id === blockName) ?? models[0];
	if (!target) {
		logger.error("Model has no `models[]` entry to add fields to.");
		process.exitCode = 1;
		return;
	}
	target.fields = Array.isArray(target.fields) ? target.fields : [];

	// Add fields by name (never duplicate).
	const existing = new Set<string>(target.fields.map((x: Field) => x.name));
	const added: string[] = [];
	const skipped: string[] = [];
	for (const p of partials) {
		for (const field of p.build()) {
			if (existing.has(field.name)) {
				skipped.push(field.name);
				continue;
			}
			existing.add(field.name);
			target.fields.push(field);
			added.push(field.name);
		}
	}

	await writeFile(modelFile, `${JSON.stringify(model, null, 2)}\n`);

	logger.info(ui.heading("Model updated", `blocks/${blockName}/_${blockName}.json`));
	logger.info(ui.accentLine("partials", partials.map((p) => p.id).join(", ")));
	logger.info(ui.accentLine("fields added", added.length ? added.join(", ") : "(none)"));
	if (skipped.length) logger.info(ui.statusLine("warn", "skipped (exists)", skipped.join(", ")));
	logger.info("");
	logger.info(ui.box([`${added.length} field(s) added to "${blockName}"`]));
}
