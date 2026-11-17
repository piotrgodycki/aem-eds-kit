/**
 * The project's own events, in `.edsrc.json`, for blocks to push instead of
 * the default block_click / form_submit / block_view:
 *
 *   "events": {
 *     "promo_click": { "fields": [
 *       { "name": "promo.id", "from": "attr", "key": "data-promo-id" },
 *       { "name": "promo.name", "from": "text", "key": ".title" },
 *       { "name": "promo.position", "from": "builtin", "key": "position" },
 *       { "name": "link.url", "from": "builtin", "key": "href" },
 *       { "name": "page.type", "from": "page", "key": "page.type" }
 *     ] }
 *   }
 *
 * Each field is read where the event happens: the clicked link or button, the
 * submitted form, or the block itself for a view.
 */

import { z } from "zod";
import { EVENT_NAME, FIELD_PATH, objectBody, q, shapeProblem } from "./event-shape.js";

/** What a block event always knows, for a `builtin` field. */
const BUILTINS = ["block", "label", "href", "position"] as const;

const fieldSchema = z
	.object({
		name: z
			.string()
			.regex(FIELD_PATH, "a field name is a JS identifier, dots nest it, e.g. promo.id"),
		from: z.enum(["attr", "text", "builtin", "page", "fixed"]),
		key: z.string().max(120).optional(),
		value: z.string().max(200).optional(),
	})
	.superRefine((f, ctx) => {
		const need = (ok: boolean, message: string) => {
			if (!ok) ctx.addIssue({ code: "custom", message: `${f.name}: ${message}` });
		};
		if (f.from === "attr")
			need(
				/^[A-Za-z][\w:.-]{0,59}$/.test(f.key ?? ""),
				`"key" names the attribute, e.g. data-promo-id`,
			);
		if (f.from === "text") need(!/[\r\n]/.test(f.key ?? ""), `"key" is one CSS selector`);
		if (f.from === "builtin")
			need(
				(BUILTINS as readonly string[]).includes(f.key ?? ""),
				`"key" is one of ${BUILTINS.join(", ")}`,
			);
		if (f.from === "page")
			need(FIELD_PATH.test(f.key ?? ""), `"key" is a page event field, e.g. page.type`);
		if (f.from === "fixed") need(f.value !== undefined, `"value" is the fixed value`);
	});

const eventSchema = z.object({ fields: z.array(fieldSchema).max(30) });
type EventField = z.infer<typeof fieldSchema>;
export type EventDefs = Record<string, z.infer<typeof eventSchema>>;

/** One event's definition, checked; throws with what is wrong. */
export function parseEvent(name: string, raw: unknown): EventDefs[string] {
	if (!EVENT_NAME.test(name))
		throw new Error(`"${name}" isn't an event name (letters, digits, _ : . -; up to 64).`);
	const r = eventSchema.safeParse(raw);
	if (!r.success) throw new Error(`${name}: ${r.error.issues.map((i) => i.message).join("; ")}`);
	const problem = shapeProblem(r.data.fields.map((f) => f.name));
	if (problem) throw new Error(`${name}: ${problem}`);
	return r.data;
}

/** The config's events, checked; throws with what is wrong. */
export function parseEvents(raw: unknown): EventDefs {
	if (raw === undefined || raw === null) return {};
	if (typeof raw !== "object" || Array.isArray(raw))
		throw new Error("events in .edsrc.json is an object: event name to its fields.");
	const out: EventDefs = {};
	for (const [name, def] of Object.entries(raw)) {
		try {
			out[name] = parseEvent(name, def);
		} catch (err) {
			throw new Error(`events in .edsrc.json: ${(err as Error).message}`);
		}
	}
	return out;
}

/**
 * How a field is read in the block's code. `el` is where the event happened
 * (the link, the form, or the block), `block` is decorate()'s parameter.
 */
function fieldJs(f: EventField, el: string, block: string, blockName: string): string {
	const key = f.key ?? "";
	switch (f.from) {
		case "attr":
			return `(${el}.closest(${q(`[${key}]`)}) || ${block}.querySelector(${q(`[${key}]`)}))?.getAttribute(${q(key)}) || ''`;
		case "text":
			return key
				? `(${el}.querySelector(${q(key)}) || ${block}.querySelector(${q(key)}))?.textContent.trim() || ''`
				: `${el}.textContent.trim()`;
		case "builtin":
			if (key === "block") return q(blockName);
			if (key === "label") return `${el}.dataset.track || ${el}.textContent.trim()`;
			if (key === "href") return `${el}.getAttribute('href') || ''`;
			// The block's place among the page's blocks of its kind: hero-1, hero-2.
			return `${q(`${blockName}-`)} + ([...document.querySelectorAll(${q(`.${blockName}`)})].indexOf(${block}) + 1)`;
		case "page":
			return `window.edsPageMeta?.${key.split(".").join("?.")} ?? ''`;
		case "fixed":
			return q(f.value ?? "");
	}
}

/**
 * The lines that push one event: its own fields when the project defines it,
 * else the default payload. Indented for a listener's body.
 */
export function pushLines(
	event: string,
	fallback: Array<[string, string]>,
	defs: EventDefs,
	el: string,
	block: string,
	blockName: string,
	indent: string,
): string[] {
	const def = defs[event];
	const fields: Array<[string, string]> = def
		? def.fields.map((f) => [f.name, fieldJs(f, el, block, blockName)])
		: fallback;
	return [
		`${indent}track({`,
		`${indent}  event: ${q(event)},`,
		...objectBody(fields, `${indent}  `),
		`${indent}});`,
	];
}
