import {
	type IncludeResolver,
	type PNode,
	type ParsedDialog,
	type UEComponent,
	type UEField,
	attr,
	childrenOf,
	cleanName,
	dedupeNames,
	parseDocview,
	pruneEmptyTabs,
	tagOf,
	valueTypeFor,
} from "./dialog.js";

/**
 * Parse a Classic UI (ExtJS) dialog - `dialog.xml` with `cq:Dialog` /
 * `cq:TabPanel` / `cq:Widget` nodes and `xtype`s - into the same Universal
 * Editor fields as a Touch UI dialog. AEM 6.5 still runs these (Classic UI is
 * deprecated, not removed), and older projects often have no Touch UI dialog.
 */

/** Containers whose children are fields (a `tabpanel`'s children are tabs). */
const CONTAINERS = new Set(["dialog", "panel", "dialogfieldset", "multifieldpanel", "fieldset"]);
/** Nothing to author: hidden values, static text, editor-only widgets. */
const SILENT = new Set(["hidden", "static", "displayfield", "label", "box", "componentstyles"]);

function xtypeOf(n: PNode): string {
	return (attr(n, "xtype") ?? "").toLowerCase();
}

function itemsOf(n: PNode): PNode[] {
	const items = childrenOf(n).find((c) => tagOf(c) === "items");
	// Widgets can also sit directly under a dialog, with no `items` collection.
	if (!items) return childrenOf(n).filter((c) => /^cq:/.test(attr(c, "jcr:primaryType") ?? ""));
	// `items` is either the collection itself or a single widget (e.g. a tabpanel).
	return attr(items, "jcr:primaryType") === "cq:WidgetCollection" || !attr(items, "xtype")
		? childrenOf(items)
		: [items];
}

/** Static `{ text, value }` options from an `options` child collection. */
function readOptions(n: PNode): { name: string; value: string }[] {
	const opts = childrenOf(n).find((c) => tagOf(c) === "options");
	if (!opts) return [];
	return childrenOf(opts).map((o) => {
		const value = attr(o, "value") ?? "";
		return { name: attr(o, "text") ?? value, value };
	});
}

interface Ctx {
	unmapped: Set<string>;
	datasourced: Set<string>;
	counter: { i: number };
	resolveInclude?: IncludeResolver;
	depth: number;
}

function leaf(n: PNode, xtype: string, ctx: Ctx): UEField | null {
	// ACS multifieldpanel sub-fields are keyed by `key` instead of `name`.
	const rawName = attr(n, "name") ?? attr(n, "key");
	let comp: UEComponent | null = null;
	let options: { name: string; value: string }[] | undefined;
	let name = cleanName(rawName, `field${ctx.counter.i++}`);

	switch (xtype) {
		case "textfield":
		case "colorfield":
		case "":
			comp = "text";
			break;
		case "textarea":
			comp = "textarea";
			break;
		case "richtext":
			comp = "richtext";
			break;
		case "numberfield":
			comp = "number";
			break;
		case "checkbox":
			comp = "boolean";
			break;
		case "datetime":
		case "datefield":
			comp = "date-time";
			break;
		case "pathfield":
		case "browsefield":
			comp = "aem-content";
			break;
		case "tags":
		case "tagsinputfield":
			comp = "aem-tag";
			break;
		case "smartimage":
		case "html5smartimage":
		case "smartfile":
		case "html5smartfile":
		case "fileupload":
			comp = "reference";
			name = cleanName(attr(n, "fileReferenceParameter") ?? rawName, name);
			break;
		case "selection": {
			const type = (attr(n, "type") ?? "select").toLowerCase();
			options = readOptions(n);
			if (type === "checkbox") comp = options.length ? "checkbox-group" : "boolean";
			else if (type === "radio") comp = "radio-group";
			else comp = "select";
			if (comp !== "boolean" && !options.length) {
				// Options come from `options="/path.json"` / an optionsProvider at runtime.
				comp = "text";
				ctx.datasourced.add(name);
			}
			break;
		}
		default:
			return null;
	}

	const field: UEField = { component: comp, name };
	const vt = valueTypeFor(comp);
	if (vt) field.valueType = vt;
	const label = attr(n, "fieldLabel") ?? attr(n, "boxLabel") ?? attr(n, "title");
	if (label) field.label = label;
	if (options?.length && comp !== "text") field.options = options;
	// A checkbox's `value` is what it submits when ticked; its default state is `checked`.
	const def =
		comp === "boolean"
			? (attr(n, "checked") ?? attr(n, "defaultValue"))
			: (attr(n, "defaultValue") ?? attr(n, "value"));
	if (def !== undefined && def !== "") field.value = comp === "boolean" ? def === "true" : def;
	return field;
}

function walk(nodes: PNode[], out: UEField[], ctx: Ctx): void {
	for (const n of nodes) {
		const xtype = xtypeOf(n);
		if (SILENT.has(xtype)) continue;

		// A widget collection (e.g. the `items` of an included panel): walk its widgets.
		if (tagOf(n) === "items" || attr(n, "jcr:primaryType") === "cq:WidgetCollection") {
			walk(childrenOf(n), out, ctx);
			continue;
		}

		// The foundation rich-text include (`rte.*.json`) is the component's text field.
		if (xtype === "slingscriptinclude") {
			if (/^rte\./.test(attr(n, "script") ?? "")) {
				out.push({ component: "richtext", name: "text", valueType: "string", label: "Text" });
			} else ctx.unmapped.add("xtype:slingscriptinclude");
			continue;
		}

		if (xtype === "cqinclude") {
			// `path` is a JSON view of another dialog part, e.g. `…/items/tab2.infinity.json`.
			const p = (attr(n, "path") ?? "").replace(/\.(infinity|\d+)?\.?json$/, "");
			const included = ctx.depth < 8 ? ctx.resolveInclude?.(p) : null;
			if (included) walk(included, out, { ...ctx, depth: ctx.depth + 1 });
			continue;
		}

		if (xtype === "tabpanel") {
			for (const tab of itemsOf(n)) {
				// A whole tab pulled in from elsewhere: walk the include itself.
				if (xtypeOf(tab) === "cqinclude") {
					walk([tab], out, ctx);
					continue;
				}
				out.push({ component: "tab", name: tagOf(tab), label: attr(tab, "title") });
				walk(itemsOf(tab), out, ctx);
			}
			continue;
		}

		if (xtype === "multifield") {
			const config = childrenOf(n).find((c) => tagOf(c) === "fieldConfig");
			const name = cleanName(attr(n, "name"), `items${ctx.counter.i++}`);
			// One unnamed widget: a plain multi-value property (e.g. String[]).
			if (
				config &&
				!CONTAINERS.has(xtypeOf(config)) &&
				!attr(config, "name") &&
				!attr(config, "key")
			) {
				const single = leaf(config, xtypeOf(config), ctx);
				if (single) {
					out.push({ ...single, name, label: attr(n, "fieldLabel") ?? single.label, multi: true });
					continue;
				}
			}
			const sub: UEField[] = [];
			if (config) walk(CONTAINERS.has(xtypeOf(config)) ? itemsOf(config) : [config], sub, ctx);
			out.push({
				component: "container",
				name,
				label: attr(n, "fieldLabel") ?? "Items",
				multi: true,
				collapsible: true,
				fields: sub,
			});
			continue;
		}

		// A container (explicit xtype, cq:Panel, or a widget that only holds items).
		if (
			CONTAINERS.has(xtype) ||
			attr(n, "jcr:primaryType") === "cq:Panel" ||
			(!xtype && !attr(n, "name") && itemsOf(n).length)
		) {
			walk(itemsOf(n), out, ctx);
			continue;
		}

		const field = attr(n, "name") || attr(n, "key") ? leaf(n, xtype, ctx) : null;
		if (field) out.push(field);
		else if (xtype) ctx.unmapped.add(`xtype:${xtype}`);
	}
}

/** True when a dialog file is Classic UI (ExtJS) rather than Touch UI (Granite). */
export function isClassicDialog(xml: string): boolean {
	return /jcr:primaryType="cq:(Dialog|TabPanel|Panel|Widget)"/.test(xml) || /\sxtype="/.test(xml);
}

/** Parse a Classic UI dialog into Universal Editor fields. */
export function parseClassicDialog(
	xml: string,
	opts: { resolveInclude?: IncludeResolver } = {},
): ParsedDialog {
	const root = parseDocview(xml).find((n) => tagOf(n) === "jcr:root");
	const fields: UEField[] = [];
	const ctx: Ctx = {
		unmapped: new Set(),
		datasourced: new Set(),
		counter: { i: 1 },
		resolveInclude: opts.resolveInclude,
		depth: 0,
	};
	// The root is itself a dialog / tabpanel / panel widget.
	if (root) walk([root], fields, ctx);
	return {
		fields: pruneEmptyTabs(dedupeNames(fields)),
		unmapped: [...ctx.unmapped],
		datasourced: [...ctx.datasourced],
	};
}
