import { XMLParser } from "fast-xml-parser";

/**
 * Parse a classic-AEM Touch UI dialog (`_cq_dialog/.content.xml`, a FileVault
 * docview) and map its Granite/Coral fields onto Universal Editor fields - the
 * same 17-type catalog `eds scaffold ue` emits. Deterministic, no agent: the
 * set of Granite `sling:resourceType`s is finite, so the mapping is a table.
 */

export type UEComponent =
	| "text"
	| "textarea"
	| "richtext"
	| "number"
	| "boolean"
	| "date-time"
	| "select"
	| "radio-group"
	| "multiselect"
	| "checkbox-group"
	| "reference"
	| "aem-content"
	| "aem-content-fragment"
	| "aem-experience-fragment"
	| "aem-tag"
	| "container"
	| "tab";

export interface UEField {
	component: UEComponent;
	name: string;
	label?: string;
	valueType?: string;
	value?: unknown;
	options?: { name: string; value: string }[];
	multi?: boolean;
	collapsible?: boolean;
	fields?: UEField[];
}

/** Resolves a Granite `include` path to the dialog nodes it pulls in (or null). */
export type IncludeResolver = (includePath: string) => PNode[] | null;

export interface ParseDialogOptions {
	resolveInclude?: IncludeResolver;
}

export interface ParsedDialog {
	fields: UEField[];
	/** Granite resourceTypes we didn't recognise (skipped), for reporting. */
	unmapped: string[];
	/** Choice fields whose options come from a runtime datasource, migrated as text. */
	datasourced: string[];
}

// ── preserveOrder node helpers ─────────────────────────────────

export type PNode = Record<string, unknown>;

export function tagOf(n: PNode): string {
	return Object.keys(n).find((k) => k !== ":@") ?? "";
}
export function childrenOf(n: PNode): PNode[] {
	const t = tagOf(n);
	const v = n[t];
	return Array.isArray(v) ? (v as PNode[]) : [];
}
function attrsOf(n: PNode): Record<string, string> {
	return (n[":@"] as Record<string, string>) ?? {};
}
/** FileVault values are prefixed with their type, e.g. `{Boolean}true`. */
function stripType(v: string | undefined): string | undefined {
	return typeof v === "string" ? v.replace(/^\{[^}]+\}/, "") : v;
}
export function attr(n: PNode, name: string): string | undefined {
	return stripType(attrsOf(n)[`@_${name}`]);
}

// ── resourceType → UE field mapping ────────────────────────────

function leafComponent(rt: string, n: PNode): UEComponent | null {
	const multiple = attr(n, "multiple") === "true" || attr(n, "multiple") === "{Boolean}true";
	// Core Components' page picker, CF / XF pickers: check these before the
	// generic pathfield / contentfragment matches below.
	if (rt.endsWith("/form/pagefield")) return "aem-content";
	if (rt.includes("experience-fragment") || rt.endsWith("/xffield"))
		return "aem-experience-fragment";
	if (rt.endsWith("/cfpicker")) return "aem-content-fragment";
	if (rt.endsWith("/form/textfield")) return "text";
	if (rt.endsWith("/form/colorfield") || rt.includes("/autocomplete")) return "text";
	if (rt.endsWith("/form/textarea")) return "textarea";
	if (rt.includes("/richtext")) return "richtext";
	if (rt.endsWith("/form/numberfield")) return "number";
	if (rt.endsWith("/form/checkbox")) return "boolean";
	if (rt.endsWith("/form/radiogroup")) return "radio-group";
	if (rt.endsWith("/form/select")) return multiple ? "multiselect" : "select";
	if (rt.endsWith("/form/datepicker")) return "date-time";
	if (rt.endsWith("/form/pathfield") || rt.endsWith("/form/pathbrowser")) return "aem-content";
	if (rt.includes("/fileupload") || rt.endsWith("/form/fileupload")) return "reference";
	if (rt.includes("tagfield") || rt.includes("tagpicker") || rt.includes("tagbrowser"))
		return "aem-tag";
	if (rt.includes("contentfragment")) return "aem-content-fragment";
	if (rt.includes("experiencefragment")) return "aem-experience-fragment";
	return null;
}

/** Fields with nothing to author (hidden values, static text) - skipped without a warning. */
function isSilent(rt: string): boolean {
	return (
		rt.endsWith("/form/hidden") ||
		rt.endsWith("/foundation/heading") ||
		rt.endsWith("/foundation/text")
	);
}

/** Granite layout containers that only hold other fields - never a UE field. */
function isWrapper(rt: string): boolean {
	return (
		rt.includes("/foundation/container") ||
		rt.includes("/foundation/fixedcolumns") ||
		rt.includes("/foundation/well") ||
		rt.includes("/foundation/tabs") ||
		rt.includes("/foundation/form/fieldset") ||
		rt.includes("/foundation/accordion")
	);
}

export function valueTypeFor(c: UEComponent): string | undefined {
	switch (c) {
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "date-time":
			return "date";
		case "checkbox-group":
			return "string[]";
		case "aem-content":
		case "aem-content-fragment":
		case "aem-experience-fragment":
			return undefined;
		default:
			return "string";
	}
}

export function cleanName(raw: string | undefined, fallback: string): string {
	const n = (raw ?? "").replace(/^\.\//, "").trim();
	return n || fallback;
}

/** Options for Core Components' heading-level datasources (title / teaser types). */
const HEADING_OPTIONS = ["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => ({
	name: h.toUpperCase(),
	value: h,
}));

/** Collect `{ name, value }` options from a field's `items` children. */
function readOptions(fieldNode: PNode): { name: string; value: string }[] {
	const items = childrenOf(fieldNode).find((c) => tagOf(c) === "items");
	if (!items) return [];
	return childrenOf(items).map((opt) => {
		const value = attr(opt, "value") ?? "";
		const name = attr(opt, "text") ?? attr(opt, "jcr:title") ?? value;
		return { name, value };
	});
}

// ── recursive walk ─────────────────────────────────────────────

interface WalkContext {
	unmapped: Set<string>;
	datasourced: Set<string>;
	counter: { i: number };
	resolveInclude?: IncludeResolver;
	/** Nested include depth - guards against include cycles. */
	includeDepth: number;
}

function walk(nodes: PNode[], out: UEField[], ctx: WalkContext): void {
	const { unmapped, counter } = ctx;
	for (const node of nodes) {
		const rt = attr(node, "sling:resourceType") ?? "";

		// Include: pull in a shared dialog fragment (e.g. the Core Components link
		// editor) when it can be resolved from disk; otherwise skip it quietly.
		if (rt.endsWith("/foundation/include")) {
			const included = ctx.includeDepth < 8 ? ctx.resolveInclude?.(attr(node, "path") ?? "") : null;
			if (included) walk(included, out, { ...ctx, includeDepth: ctx.includeDepth + 1 });
			continue;
		}
		if (isSilent(rt)) continue;

		// Tabs: emit a `tab` marker per child tab, then recurse into each tab.
		if (rt.endsWith("/foundation/tabs")) {
			const items = childrenOf(node).find((c) => tagOf(c) === "items");
			for (const tab of items ? childrenOf(items) : []) {
				const label = attr(tab, "jcr:title");
				out.push({ component: "tab", name: cleanName(undefined, tagOf(tab)), label });
				walk(childrenOf(tab), out, ctx);
			}
			continue;
		}

		// Multifield: a repeatable container. Collect its template sub-fields.
		if (rt.endsWith("/form/multifield")) {
			const sub: UEField[] = [];
			walk(childrenOf(node), sub, ctx);
			// A composite multifield keeps its property name on the `field` child.
			const fieldChild = childrenOf(node).find((c) => tagOf(c) === "field");
			const name = cleanName(
				attr(node, "name") ?? (fieldChild ? attr(fieldChild, "name") : undefined),
				`items${counter.i++}`,
			);
			out.push({
				component: "container",
				name,
				label: attr(node, "fieldLabel") ?? "Items",
				multi: true,
				collapsible: true,
				fields: sub,
			});
			continue;
		}

		const comp = rt ? leafComponent(rt, node) : null;
		if (comp) {
			const name = cleanName(attr(node, "name"), `field${counter.i++}`);
			const field: UEField = { component: comp, name };
			const vt = valueTypeFor(comp);
			if (vt) field.valueType = vt;
			const label = attr(node, "fieldLabel") ?? attr(node, "text");
			if (label) field.label = label;
			if (comp === "select" || comp === "radio-group" || comp === "multiselect") {
				const options = readOptions(node);
				const ds = childrenOf(node).find((c) => tagOf(c) === "datasource");
				const dsType = ds ? (attr(ds, "sling:resourceType") ?? "") : "";
				if (options.length) field.options = options;
				else if (/heading|allowedtypes/i.test(dsType)) field.options = HEADING_OPTIONS;
				else {
					// Options are computed at runtime (a datasource) - a UE choice field
					// needs static options, so fall back to text and say so.
					field.component = "text";
					field.valueType = "string";
					ctx.datasourced.add(name);
				}
			}
			const def = attr(node, "value") ?? (comp === "boolean" ? attr(node, "checked") : undefined);
			if (def !== undefined && def !== "") field.value = comp === "boolean" ? def === "true" : def;
			out.push(field);
			continue;
		}

		// Unknown field (has a resourceType + a name but no mapping) - record it,
		// unless it's a layout wrapper (container/columns/well/fieldset).
		if (rt && attr(node, "name") && !isWrapper(rt)) unmapped.add(rt);

		// Layout wrapper (container / fixedcolumns / column / items / well): recurse.
		walk(childrenOf(node), out, ctx);
	}
}

/** Drop tab markers that ended up with no fields (e.g. a tab of only includes). */
export function pruneEmptyTabs(fields: UEField[]): UEField[] {
	return fields.filter(
		(f, i) => f.component !== "tab" || (fields[i + 1] && fields[i + 1].component !== "tab"),
	);
}

/**
 * Keep the first field per name at each level. Dialogs often carry two
 * variants of one property shown conditionally (e.g. Core Components'
 * `./titleType`); a UE model needs unique names.
 */
export function dedupeNames(fields: UEField[]): UEField[] {
	const seen = new Set<string>();
	const out: UEField[] = [];
	for (const f of fields) {
		if (f.component !== "tab") {
			if (seen.has(f.name)) continue;
			seen.add(f.name);
		}
		out.push(f.fields ? { ...f, fields: dedupeNames(f.fields) } : f);
	}
	return out;
}

/** Parse a FileVault docview XML into preserveOrder nodes. */
export function parseDocview(xml: string): PNode[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		preserveOrder: true,
		removeNSPrefix: false,
		trimValues: true,
	});
	return parser.parse(xml) as PNode[];
}

/** Parse a Touch UI dialog XML into Universal Editor fields. */
export function parseDialog(xml: string, opts: ParseDialogOptions = {}): ParsedDialog {
	const root = parseDocview(xml).find((n) => tagOf(n) === "jcr:root");
	const fields: UEField[] = [];
	const unmapped = new Set<string>();
	const datasourced = new Set<string>();
	if (root) {
		walk(childrenOf(root), fields, {
			unmapped,
			datasourced,
			counter: { i: 1 },
			resolveInclude: opts.resolveInclude,
			includeDepth: 0,
		});
	}
	return {
		fields: pruneEmptyTabs(dedupeNames(fields)),
		unmapped: [...unmapped],
		datasourced: [...datasourced],
	};
}

/** Number of authorable fields (tab markers excluded, container sub-fields included). */
export function countLeafFields(fields: UEField[]): number {
	let n = 0;
	for (const f of fields) {
		if (f.component === "tab") continue;
		n += 1;
		if (f.fields) n += countLeafFields(f.fields);
	}
	return n;
}
