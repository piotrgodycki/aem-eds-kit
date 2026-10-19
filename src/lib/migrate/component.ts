import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
	type IncludeResolver,
	type PNode,
	type ParsedDialog,
	type UEField,
	childrenOf,
	countLeafFields,
	parseDialog,
	parseDocview,
	tagOf,
} from "./dialog.js";

/** Locate the Touch UI dialog inside a classic component folder. */
export function findDialogFile(componentDir: string): string | null {
	const candidates = [
		path.join(componentDir, "_cq_dialog", ".content.xml"),
		path.join(componentDir, "_cq_dialog.xml"),
		path.join(componentDir, "cq:dialog", ".content.xml"),
	];
	return candidates.find((c) => existsSync(c)) ?? null;
}

/** A Classic UI (ExtJS) dialog, which this migration doesn't read. */
export function findClassicDialogFile(componentDir: string): string | null {
	const candidates = [
		path.join(componentDir, "dialog.xml"),
		path.join(componentDir, "dialog", ".content.xml"),
	];
	return candidates.find((c) => existsSync(c)) ?? null;
}

/** A root attribute of the component's `.content.xml` (`jcr:title`, `sling:resourceSuperType`…). */
function readComponentAttr(componentDir: string, name: string): string | undefined {
	const file = path.join(componentDir, ".content.xml");
	if (!existsSync(file)) return undefined;
	try {
		const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
		const root = parser.parse(readFileSync(file, "utf-8"))["jcr:root"] ?? {};
		const v = root[`@_${name}`];
		return typeof v === "string" ? v.replace(/^\{[^}]+\}/, "") : undefined;
	} catch {
		return undefined;
	}
}

/** Read the component's `jcr:title` from its `.content.xml`, if present. */
export async function readComponentTitle(componentDir: string): Promise<string | undefined> {
	return readComponentAttr(componentDir, "jcr:title");
}

/** The `sling:resourceSuperType` a proxy component inherits its dialog from. */
export function readSuperType(componentDir: string): string | undefined {
	return readComponentAttr(componentDir, "sling:resourceSuperType");
}

/** The FileVault `jcr_root` folder a component sits in, if any. */
export function jcrRootOf(dir: string): string | null {
	let d = path.resolve(dir);
	while (d !== path.dirname(d)) {
		if (path.basename(d) === "jcr_root") return d;
		d = path.dirname(d);
	}
	return null;
}

/**
 * Map a repository path (`/apps/x`, `/libs/x`, `/mnt/overlay/x` or a bare
 * resource type `core/wcm/…`) onto disk under one of `roots` (FileVault
 * `jcr_root` folders, or an `apps` folder). `cq:dialog` → `_cq_dialog`.
 */
export function repoPathCandidates(repoPath: string, roots: string[]): string[] {
	const rel = repoPath
		.replace(/^\/mnt\/overlay\//, "/")
		.replace(/^\/(apps|libs)\//, "")
		.replace(/^\//, "")
		.split("/")
		.map((seg) => seg.replace(/^([a-z]+):/, "_$1_"))
		.join("/");
	const out: string[] = [];
	for (const root of roots) {
		out.push(path.join(root, "apps", rel), path.join(root, "libs", rel), path.join(root, rel));
	}
	return out;
}

/** Resolve a Granite `include` path to the dialog nodes it pulls in, from disk. */
export function includeResolver(roots: string[]): IncludeResolver {
	const cache = new Map<string, PNode[] | null>();
	const load = (file: string): PNode[] | null => {
		if (!cache.has(file)) {
			try {
				const root = parseDocview(readFileSync(file, "utf-8")).find((n) => tagOf(n) === "jcr:root");
				cache.set(file, root ? childrenOf(root) : null);
			} catch {
				cache.set(file, null);
			}
		}
		return cache.get(file) ?? null;
	};
	return (includePath) => {
		if (!includePath || includePath.includes("${")) return null; // EL paths: runtime only
		for (const full of repoPathCandidates(includePath, roots)) {
			// Walk up to the folder whose .content.xml holds the target node,
			// then down through the nodes inside that file.
			const segs = full.split(path.sep);
			for (let i = segs.length; i > 1; i--) {
				const dir = segs.slice(0, i).join(path.sep);
				const file = existsSync(path.join(dir, ".content.xml"))
					? path.join(dir, ".content.xml")
					: existsSync(`${dir}.xml`)
						? `${dir}.xml`
						: null;
				if (!file) continue;
				let nodes = load(file);
				for (const name of segs.slice(i)) {
					const next = nodes?.find((n) => tagOf(n) === name);
					nodes = next ? [next] : null;
				}
				if (nodes) return nodes;
				break;
			}
		}
		return null;
	};
}

export interface ResolvedDialog extends ParsedDialog {
	/** Resource type the dialog was inherited from (proxy components). */
	inheritedFrom?: string;
}

/**
 * Read and map a component's dialog fields. A proxy component (no dialog of its
 * own, or an overlay with no fields) inherits the dialog of its
 * `sling:resourceSuperType`, looked up in the component's own `jcr_root` and in
 * `extraRoots`. Returns null when no dialog can be found.
 */
export async function readDialogFields(
	componentDir: string,
	extraRoots: string[] = [],
): Promise<ResolvedDialog | null> {
	const own = jcrRootOf(componentDir);
	const roots = [...(own ? [own] : []), ...extraRoots];
	const resolveInclude = includeResolver(roots);

	let dir = componentDir;
	let inheritedFrom: string | undefined;
	let ownParsed: ParsedDialog | null = null;
	for (let hop = 0; hop < 8; hop++) {
		const dialog = findDialogFile(dir);
		if (dialog) {
			const parsed = parseDialog(await readFile(dialog, "utf-8"), { resolveInclude });
			if (countLeafFields(parsed.fields) > 0) return { ...parsed, inheritedFrom };
			ownParsed ??= parsed;
		}
		const superType = readSuperType(dir);
		const next = superType
			? repoPathCandidates(superType, roots).find((c) => existsSync(c))
			: undefined;
		if (!superType || !next) break;
		dir = next;
		inheritedFrom = superType;
	}
	return ownParsed;
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
