/**
 * What an EDS page runs in each of its three loading phases, read from
 * scripts/scripts.js (loadEager, loadLazy, loadDelayed) and scripts/delayed.js:
 *
 *   eager    before the first paint: decides LCP, so it holds only what the page needs to show
 *   lazy     right after: the rest of the page (header, footer, sections, lazy styles)
 *   delayed  about 3 s after load: martech, tag managers, chat and the rest
 *
 * A third party in eager or lazy is flagged, since it slows the page down.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PhaseCall {
	name: string;
	/** Where it comes from: the file that defines it, e.g. aem.js. */
	file: string;
	warn?: string;
}

export interface Phases {
	eager: PhaseCall[];
	lazy: PhaseCall[];
	delayed: PhaseCall[];
}

/** Names that look like a third party: tag managers, analytics, consent, chat, pixels. */
const THIRD_PARTY =
	/consent|onetrust|cookiebot|cookie|gtm|gtag|tagmanager|analytics|launch|martech|pixel|hotjar|clarity|chat|intercom|zendesk|loadScript/i;

/** Calls that are language or DOM plumbing, not a step of the page. */
const IGNORED = new Set([
	"if",
	"for",
	"while",
	"switch",
	"catch",
	"function",
	"return",
	"typeof",
	"import",
	"require",
	"setTimeout",
	"setInterval",
	"Promise",
	"Array",
	"Object",
	"String",
	"Number",
	"Boolean",
	"JSON",
	"Math",
	"Date",
	"URL",
	"URLSearchParams",
	"fetch",
	"then",
	"resolve",
	"reject",
	"await",
	"async",
]);

/** The body of `function <name>(…) { … }` (async or not); null when it isn't there. */
export function functionBody(js: string, name: string): string | null {
	const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(js);
	if (!m) return null;
	let depth = 0;
	for (let i = m.index + m[0].length - 1; i < js.length; i++) {
		if (js[i] === "{") depth++;
		else if (js[i] === "}" && --depth === 0) return js.slice(m.index + m[0].length, i);
	}
	return null;
}

/** The functions a piece of code runs by name (not methods), in order, each once. */
export function callsIn(code: string): string[] {
	const out: string[] = [];
	// A call, or a function handed on to run next: .then(loadGTM).
	for (const m of code.matchAll(
		/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(|\.then\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
	)) {
		const name = m[1] ?? m[2];
		if (!IGNORED.has(name) && !out.includes(name)) out.push(name);
	}
	return out;
}

/** Which file each imported name comes from, e.g. { loadHeader: "aem.js" }. */
export function importsOf(js: string): Record<string, string> {
	const from: Record<string, string> = {};
	for (const m of js.matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
		const file = path.posix.basename(m[2]);
		const names = m[1].replace(/[{}]/g, ",").split(",");
		for (const n of names) {
			const local = n
				.trim()
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (local && /^[A-Za-z_$][\w$]*$/.test(local)) from[local] = file;
		}
	}
	return from;
}

/** Top-level code: the file without its function declarations, which only run when called. */
function topLevel(js: string): string {
	let out = js;
	for (;;) {
		const m = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.exec(out);
		if (!m) return out;
		const body = functionBody(out.slice(m.index), m[1]);
		const end = m.index + m[0].length + (body?.length ?? 0) + 1;
		out = out.slice(0, m.index) + out.slice(body === null ? m.index + m[0].length : end);
	}
}

function describe(calls: string[], from: Record<string, string>, own: string, phase: keyof Phases) {
	return calls.map((name): PhaseCall => {
		const file = from[name] ?? own;
		const third = THIRD_PARTY.test(name) || THIRD_PARTY.test(file);
		const warn =
			third && phase === "eager"
				? "A third party here slows LCP: move it to Delayed."
				: third && phase === "lazy"
					? "Third parties belong in Delayed, after the page has loaded."
					: undefined;
		return { name, file, ...(warn ? { warn } : {}) };
	});
}

/** The project's three phases; null when scripts/scripts.js has none of them. */
export async function readPhases(root: string): Promise<Phases | null> {
	const read = (rel: string) => readFile(path.join(root, rel), "utf-8").catch(() => "");
	const scripts = await read("scripts/scripts.js");
	const eager = functionBody(scripts, "loadEager");
	const lazy = functionBody(scripts, "loadLazy");
	const delayedFn = functionBody(scripts, "loadDelayed");
	if (eager === null && lazy === null && delayedFn === null) return null;
	const from = importsOf(scripts);
	const delayedJs = /delayed\.js/.test(delayedFn ?? "") ? await read("scripts/delayed.js") : "";
	const delayed = [
		...describe(callsIn(delayedFn ?? ""), from, "scripts.js", "delayed"),
		...describe(callsIn(topLevel(delayedJs)), importsOf(delayedJs), "delayed.js", "delayed"),
	];
	return {
		eager: describe(callsIn(eager ?? ""), from, "scripts.js", "eager"),
		lazy: describe(callsIn(lazy ?? ""), from, "scripts.js", "lazy"),
		delayed: delayed.filter((c, i) => delayed.findIndex((d) => d.name === c.name) === i),
	};
}
