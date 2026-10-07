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

export interface ParsedDialog {
	fields: UEField[];
	/** Granite resourceTypes we didn't recognise (skipped), for reporting. */
	unmapped: string[];
}

// ── preserveOrder node helpers ─────────────────────────────────

type PNode = Record<string, unknown>;

function tagOf(n: PNode): string {
	return Object.keys(n).find((k) => k !== ":@") ?? "";
}
function childrenOf(n: PNode): PNode[] {
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
function attr(n: PNode, name: string): string | undefined {
	return stripType(attrsOf(n)[`@_${name}`]);
}

// ── resourceType → UE field mapping ────────────────────────────

function leafComponent(rt: string, n: PNode): UEComponent | null {
	const multiple = attr(n, "multiple") === "true" || attr(n, "multiple") === "{Boolean}true";
	if (rt.endsWith("/form/textfield")) return "text";
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

function valueTypeFor(c: UEComponent): string | undefined {
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

function cleanName(raw: string | undefined, fallback: string): string {
	const n = (raw ?? "").replace(/^\.\//, "").trim();
	return n || fallback;
}

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

function walk(nodes: PNode[], out: UEField[], unmapped: Set<string>, counter: { i: number }): void {
	for (const node of nodes) {
		const rt = attr(node, "sling:resourceType") ?? "";

		// Tabs: emit a `tab` marker per child tab, then recurse into each tab.
		if (rt.endsWith("/foundation/tabs")) {
			const items = childrenOf(node).find((c) => tagOf(c) === "items");
			for (const tab of items ? childrenOf(items) : []) {
				const label = attr(tab, "jcr:title");
				out.push({ component: "tab", name: cleanName(undefined, tagOf(tab)), label });
				walk(childrenOf(tab), out, unmapped, counter);
			}
			continue;
		}

		// Multifield: a repeatable container. Collect its template sub-fields.
		if (rt.endsWith("/form/multifield")) {
			const sub: UEField[] = [];
			walk(childrenOf(node), sub, unmapped, counter);
			const name = cleanName(attr(node, "name"), `items${counter.i++}`);
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
				if (options.length) field.options = options;
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
		walk(childrenOf(node), out, unmapped, counter);
	}
}

/** Parse a Touch UI dialog XML into Universal Editor fields. */
export function parseDialog(xml: string): ParsedDialog {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		preserveOrder: true,
		removeNSPrefix: false,
		trimValues: true,
	});
	const tree = parser.parse(xml) as PNode[];
	const root = tree.find((n) => tagOf(n) === "jcr:root");
	const fields: UEField[] = [];
	const unmapped = new Set<string>();
	if (root) walk(childrenOf(root), fields, unmapped, { i: 1 });
	return { fields, unmapped: [...unmapped] };
}
