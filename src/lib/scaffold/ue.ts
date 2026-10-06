/**
 * Deterministic Universal Editor scaffolding: the default-content components
 * every UE/EDS project ships with, plus a `field-reference` block whose model
 * demonstrates all 17 UE field types and a multifield. No agent involved.
 *
 * Config is merged by id, so running this on an existing project adds what's
 * missing without clobbering your entries.
 */

// ── Default-content components (core/franklin) ─────────────────

export const DEFAULT_CONTENT_DEFINITIONS = [
	{
		title: "Text",
		id: "text",
		plugins: {
			xwalk: {
				page: {
					resourceType: "core/franklin/components/text/v1/text",
					template: { text: "<p>Text</p>" },
				},
			},
		},
	},
	{
		title: "Image",
		id: "image",
		plugins: {
			xwalk: {
				page: {
					resourceType: "core/franklin/components/image/v1/image",
					template: { image: "", imageAlt: "" },
				},
			},
		},
	},
	{
		title: "Button",
		id: "button",
		plugins: {
			xwalk: {
				page: {
					resourceType: "core/franklin/components/button/v1/button",
					template: { text: "Button", href: "", type: "" },
				},
			},
		},
	},
	{
		title: "Title",
		id: "title",
		plugins: {
			xwalk: {
				page: {
					resourceType: "core/franklin/components/title/v1/title",
					template: { title: "Title", type: "h2" },
				},
			},
		},
	},
];

export const DEFAULT_CONTENT_MODELS = [
	{
		id: "title",
		fields: [
			{ component: "text", valueType: "string", name: "title", label: "Title" },
			{
				component: "select",
				valueType: "string",
				name: "type",
				label: "Type",
				value: "h2",
				options: [
					{ name: "H1", value: "h1" },
					{ name: "H2", value: "h2" },
					{ name: "H3", value: "h3" },
					{ name: "H4", value: "h4" },
					{ name: "H5", value: "h5" },
					{ name: "H6", value: "h6" },
				],
			},
		],
	},
	{
		id: "image",
		fields: [
			{ component: "reference", valueType: "string", name: "image", label: "Image", multi: false },
			{ component: "text", valueType: "string", name: "imageAlt", label: "Alt Text" },
		],
	},
	{
		id: "button",
		fields: [
			{ component: "text", valueType: "string", name: "text", label: "Text" },
			{ component: "aem-content", name: "href", label: "Link" },
			{
				component: "select",
				valueType: "string",
				name: "type",
				label: "Type",
				options: [
					{ name: "Default", value: "" },
					{ name: "Primary", value: "primary" },
					{ name: "Secondary", value: "secondary" },
				],
			},
		],
	},
];

// ── field-reference block: one of every UE field type + a multifield ──

/** All 17 UE field component types, each shown once, plus a repeatable container. */
export function fieldReferenceFields(): Array<Record<string, unknown>> {
	return [
		{ component: "tab", name: "basics", label: "Basics" },
		{ component: "text", valueType: "string", name: "text", label: "Text (single line)" },
		{
			component: "textarea",
			valueType: "string",
			name: "textarea",
			label: "Textarea (multi-line)",
		},
		{ component: "richtext", valueType: "string", name: "richtext", value: "", label: "Rich text" },
		{ component: "number", valueType: "number", name: "number", label: "Number" },
		{ component: "boolean", valueType: "boolean", name: "boolean", value: false, label: "Boolean" },
		{ component: "date-time", valueType: "date", name: "date", label: "Date / time" },
		{ component: "tab", name: "selection", label: "Selection" },
		{
			component: "select",
			valueType: "string",
			name: "select",
			label: "Select",
			value: "a",
			options: [
				{ name: "Option A", value: "a" },
				{ name: "Option B", value: "b" },
			],
		},
		{
			component: "radio-group",
			valueType: "string",
			name: "radio",
			label: "Radio group",
			value: "x",
			options: [
				{ name: "X", value: "x" },
				{ name: "Y", value: "y" },
			],
		},
		{
			component: "multiselect",
			valueType: "string",
			name: "classes",
			label: "Multiselect (CSS classes)",
			options: [
				{ name: "Highlight", value: "highlight" },
				{ name: "Dark", value: "dark" },
			],
		},
		{
			component: "checkbox-group",
			valueType: "string[]",
			name: "toggles",
			label: "Checkbox group",
			options: [
				{ name: "Show title", value: "show-title" },
				{ name: "Show image", value: "show-image" },
			],
		},
		{ component: "tab", name: "media", label: "Media & content" },
		{ component: "reference", valueType: "string", name: "image", label: "Image (DAM asset)" },
		{ component: "text", valueType: "string", name: "imageAlt", label: "Image alt" },
		{ component: "aem-content", name: "link", label: "Link (page / URL)" },
		{ component: "aem-content-fragment", name: "contentFragment", label: "Content Fragment" },
		{
			component: "aem-experience-fragment",
			name: "experienceFragment",
			label: "Experience Fragment",
		},
		{ component: "aem-tag", valueType: "string", name: "tags", label: "Tags" },
		{ component: "tab", name: "repeatable", label: "Multifield" },
		{
			component: "container",
			name: "items",
			label: "Items (repeatable)",
			multi: true,
			collapsible: true,
			fields: [
				{ component: "text", valueType: "string", name: "itemTitle", label: "Title" },
				{ component: "richtext", valueType: "string", name: "itemText", value: "", label: "Text" },
				{ component: "aem-content", name: "itemLink", label: "Link" },
			],
		},
	];
}

export const FIELD_REFERENCE_JS = `// Block: field-reference
// A living reference of every Universal Editor field type (see _field-reference.json).
// Authors use it to see what's available; delete it before launch.
export default function decorate(block) {
  // Default/document authoring hands the field values in as rows - nothing to
  // enhance here beyond a scoping class. In Universal Editor the fields above
  // are what you drop and edit.
  block.classList.add('field-reference');
}
`;

export const FIELD_REFERENCE_CSS = `/* Block: field-reference */
.field-reference {
  display: grid;
  gap: var(--spacing-m, 16px);
  padding: var(--spacing-l, 32px) 0;
}
`;

export function fieldReferenceModelFile(): string {
	const model = {
		definitions: [
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
		],
		models: [{ id: "field-reference", fields: fieldReferenceFields() }],
		filters: [],
	};
	return `${JSON.stringify(model, null, 2)}\n`;
}

// ── Merge helpers (add-by-id, never clobber) ───────────────────

interface Identified {
	id: string;
}

export function mergeById<T extends Identified>(existing: T[], additions: T[]): T[] {
	const seen = new Set(existing.map((e) => e.id));
	return [...existing, ...additions.filter((a) => !seen.has(a.id))];
}

interface DefinitionGroup {
	title: string;
	id: string;
	components: Identified[];
}
interface Definitions {
	groups: DefinitionGroup[];
}

/** Merge component definitions into groups (Default Content + Blocks). */
export function mergeDefinitions(
	existing: Definitions | null,
	defaultContent: Identified[],
	blockDefs: Identified[],
): Definitions {
	const groups = existing?.groups ? [...existing.groups] : [];
	const ensure = (id: string, title: string, comps: Identified[]) => {
		let g = groups.find((x) => x.id === id);
		if (!g) {
			g = { id, title, components: [] };
			groups.push(g);
		}
		g.components = mergeById(g.components, comps);
	};
	ensure("default", "Default Content", defaultContent);
	ensure("blocks", "Blocks", blockDefs);
	return { groups };
}

interface Filter {
	id: string;
	components: string[];
}

/** Add component ids to the `section` filter (union). */
export function mergeSectionFilter(existing: Filter[] | null, ids: string[]): Filter[] {
	const filters = existing ? [...existing] : [];
	let section = filters.find((f) => f.id === "section");
	if (!section) {
		section = { id: "section", components: ["text", "image", "button", "title"] };
		filters.push(section);
	}
	section.components = [...new Set([...section.components, ...ids])];
	return filters;
}
