/**
 * The shape of a data layer event as the team defines it: fields named with
 * dots (`site.section`) become nested objects (`site: { section }`). Shared by
 * the page event (page-meta.ts) and the block events (track.ts), so both write
 * the same JavaScript.
 */

/** A field's name: up to four JS identifiers joined by dots, e.g. promo.id. */
export const FIELD_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,3}$/;

/** A data layer event's name: letters, digits, _ : . - (GA4 and Adobe both take these). */
export const EVENT_NAME = /^[A-Za-z][\w:.-]{0,63}$/;

/** A JavaScript string literal in single quotes, as EDS projects' lint wants. */
export function q(s: string): string {
	return `'${s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")}'`;
}

/**
 * What is wrong with a set of field names, or null: a name given twice, a
 * name that is both a value and a group (`page` and `page.path`), or `event`,
 * which holds the event's own name.
 */
export function shapeProblem(names: string[]): string | null {
	const seen = new Set<string>();
	for (const name of names) {
		if (name === "event" || name.startsWith("event."))
			return `"${name}": event is the event's own name, pick another field name.`;
		if (seen.has(name)) return `"${name}" is listed twice.`;
		seen.add(name);
	}
	for (const name of names) {
		const parts = name.split(".");
		for (let i = 1; i < parts.length; i++) {
			const group = parts.slice(0, i).join(".");
			if (seen.has(group)) return `"${group}" is a value and also holds "${name}".`;
		}
	}
	return null;
}

interface Node {
	value?: string;
	children: Map<string, Node>;
}

/**
 * The fields as the lines of an object literal's body, nested by their dots,
 * in the order first named. Each value is a JavaScript expression.
 */
export function objectBody(fields: Array<[name: string, js: string]>, indent: string): string[] {
	const root: Node = { children: new Map() };
	for (const [name, js] of fields) {
		let node = root;
		for (const part of name.split(".")) {
			let next = node.children.get(part);
			if (!next) {
				next = { children: new Map() };
				node.children.set(part, next);
			}
			node = next;
		}
		node.value = js;
	}
	const lines: string[] = [];
	const walk = (node: Node, pad: string) => {
		for (const [key, child] of node.children) {
			if (child.value !== undefined) lines.push(`${pad}${key}: ${child.value},`);
			else {
				lines.push(`${pad}${key}: {`);
				walk(child, `${pad}  `);
				lines.push(`${pad}},`);
			}
		}
	};
	walk(root, indent);
	return lines;
}
