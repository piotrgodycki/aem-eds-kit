import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Build a Universal Editor page template as **initial content**: an ordered list
 * of component instances with their default field values, read from each block's
 * `_<block>.json` model. The author composes the order and count in the wizard;
 * this turns that into a deterministic template spec.
 */

// biome-ignore lint/suspicious/noExplicitAny: UE model JSON is free-form
type Json = any;

export interface UeComponent {
	name: string;
	model: string;
	fields: Record<string, unknown>;
}

/** Default value for a field, from its `value` or a type-appropriate empty. */
function fieldDefault(field: Json): unknown {
	if (field.value !== undefined) return field.value;
	switch (field.valueType) {
		case "boolean":
			return false;
		case "number":
			return 0;
		case "string[]":
			return [];
		default:
			return "";
	}
}

/** Read a block's model and produce its default field values (tabs skipped, containers empty). */
export async function blockDefaults(
	projectRoot: string,
	block: string,
): Promise<Record<string, unknown>> {
	const file = path.join(projectRoot, "blocks", block, `_${block}.json`);
	if (!existsSync(file)) return {};
	try {
		const parsed: Json = JSON.parse(await readFile(file, "utf-8"));
		const models: Json[] = Array.isArray(parsed.models) ? parsed.models : [];
		const model = models.find((m) => m.id === block) ?? models[0];
		const fields: Json[] = model?.fields ?? [];
		const out: Record<string, unknown> = {};
		for (const f of fields) {
			if (f.component === "tab") continue;
			out[f.name] = f.component === "container" ? [] : fieldDefault(f);
		}
		return out;
	} catch {
		return {};
	}
}

export interface UeTemplateOptions {
	title: string;
	name: string;
	/** Block ids, in authored order (repeats allowed). */
	blocks: string[];
}

/** Render the Universal Editor initial-content template JSON. */
export async function buildUeTemplate(
	projectRoot: string,
	opts: UeTemplateOptions,
): Promise<string> {
	const components: UeComponent[] = [];
	for (const b of opts.blocks) {
		components.push({ name: b, model: b, fields: await blockDefaults(projectRoot, b) });
	}
	const template = { title: opts.title, template: opts.name, components };
	return `${JSON.stringify(template, null, 2)}\n`;
}
