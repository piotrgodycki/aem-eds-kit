import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { type ParsedDialog, type UEField, parseDialog } from "./dialog.js";

/** Locate the Touch UI dialog inside a classic component folder. */
export function findDialogFile(componentDir: string): string | null {
	const candidates = [
		path.join(componentDir, "_cq_dialog", ".content.xml"),
		path.join(componentDir, "_cq_dialog.xml"),
		path.join(componentDir, "cq:dialog", ".content.xml"),
	];
	return candidates.find((c) => existsSync(c)) ?? null;
}

/** Read the component's `jcr:title` from its `.content.xml`, if present. */
export async function readComponentTitle(componentDir: string): Promise<string | undefined> {
	const file = path.join(componentDir, ".content.xml");
	if (!existsSync(file)) return undefined;
	try {
		const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
		const parsed = parser.parse(await readFile(file, "utf-8"));
		const root = parsed["jcr:root"] ?? {};
		const title = root["@_jcr:title"];
		return typeof title === "string" ? title.replace(/^\{[^}]+\}/, "") : undefined;
	} catch {
		return undefined;
	}
}

/** Read and map a component's dialog fields. Returns null if no dialog found. */
export async function readDialogFields(componentDir: string): Promise<ParsedDialog | null> {
	const dialog = findDialogFile(componentDir);
	if (!dialog) return null;
	return parseDialog(await readFile(dialog, "utf-8"));
}

/** The `_<name>.json` Universal Editor model for a migrated block. */
export function migratedModelFile(blockName: string, title: string, fields: UEField[]): string {
	const model = {
		definitions: [
			{
				title,
				id: blockName,
				plugins: {
					xwalk: {
						page: {
							resourceType: "core/franklin/components/block/v1/block",
							template: { name: title, model: blockName },
						},
					},
				},
			},
		],
		models: [{ id: blockName, fields }],
		filters: [],
	};
	return `${JSON.stringify(model, null, 2)}\n`;
}

/** A starter `decorate()` for a migrated block. Iterates rows; if the dialog had
 * a multifield, it iterates the repeated children. HTL logic is left as a TODO. */
export function migratedBlockJs(blockName: string, fields: UEField[]): string {
	const hasContainer = fields.some((f) => f.component === "container" && f.multi);
	const body = hasContainer
		? `  // This block was migrated from a classic AEM component with a multifield.
  // Each child row is one repeated item - enhance them here.
  [...block.children].forEach((row) => {
    row.classList.add('${blockName}-item');
  });`
		: `  // Migrated from a classic AEM component. The authored fields arrive as
  // rows; read and enhance them here (port the old HTL logic as needed).`;
	return `// Block: ${blockName}
// Migrated from a classic AEM component by \`eds migrate component\`.
// TODO: port the component's HTL/JS behaviour into this decorator.
export default function decorate(block) {
  block.classList.add('${blockName}');
${body}
}
`;
}

/** An empty, scoped CSS file for a migrated block (fill from the clientlib / rendered CSS). */
export function migratedBlockCss(blockName: string): string {
	return `/* Block: ${blockName} */
/* Migrated from a classic AEM component. Bring the component's styles here */
/* (from its clientlib or the rendered page) and keep them scoped to the block. */
.${blockName} {
}
`;
}
