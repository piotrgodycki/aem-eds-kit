/**
 * Universal Editor readiness checks - all pure, no I/O. The command layer
 * reads the files and hands their contents / presence flags to these helpers,
 * so the logic stays testable and offline.
 */

/** The three crosswalk config files that make a project Universal-Editor-ready. */
export const UE_CONFIG_FILES = [
	"component-definition.json",
	"component-models.json",
	"component-filters.json",
] as const;

export const AEM_CONNECTION_META = "urn:adobe:aue:system:aemconnection";

/** Read a `<meta>` tag's `content` by its `name`, tolerant of attribute order. */
export function metaContent(html: string, name: string): string | null {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		if (tag.match(/\bname=["']([^"']+)["']/i)?.[1] === name) {
			return tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "";
		}
	}
	return null;
}

/** True if `head.html` declares an AEM content-source connection. */
export function hasAemConnection(html: string): boolean {
	return metaContent(html, AEM_CONNECTION_META) !== null;
}

/** The `id`s declared in a parsed `component-models.json` (array of `{id}`). */
export function modelIds(componentModels: unknown): string[] {
	if (!Array.isArray(componentModels)) return [];
	return componentModels
		.map((m) => (m && typeof m === "object" ? (m as { id?: unknown }).id : undefined))
		.filter((id): id is string => typeof id === "string");
}

export interface ReadinessInput {
	/** Which of {@link UE_CONFIG_FILES} exist (keyed by file name). */
	configPresent: Record<string, boolean>;
	/** Blocks found under `blocks/`, with whether a `_<name>.json` model exists. */
	blocks: { name: string; hasModelFile: boolean }[];
	/** Model ids declared in `component-models.json`. */
	modelIds: string[];
}

export interface BlockReadiness {
	name: string;
	/** Editable in the Universal Editor (has a model file or a models entry). */
	editable: boolean;
	reason?: string;
}

export interface Readiness {
	isUeProject: boolean;
	blocks: BlockReadiness[];
}

/**
 * Assess Universal Editor readiness. A project is UE-ready when it has the
 * component definition + models; a block is editable when it has a model file
 * or appears in `component-models.json`.
 */
export function assessReadiness(input: ReadinessInput): Readiness {
	const isUeProject =
		!!input.configPresent["component-definition.json"] &&
		!!input.configPresent["component-models.json"];
	const ids = new Set(input.modelIds);
	const blocks = input.blocks.map<BlockReadiness>((b) => {
		const editable = b.hasModelFile || ids.has(b.name);
		return {
			name: b.name,
			editable,
			reason: editable ? undefined : "no UE model (_<name>.json or component-models entry)",
		};
	});
	return { isUeProject, blocks };
}
