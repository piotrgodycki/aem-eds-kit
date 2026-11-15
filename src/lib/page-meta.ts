/**
 * `page_meta`: what every page tells the data layer before GTM and GA load,
 * with the team's own properties from `.edsrc.json`:
 *
 *   "pageMeta": { "properties": [
 *     { "name": "pageType", "from": "meta", "key": "page-type", "required": true, "allowed": ["home", "detail"] },
 *     { "name": "category", "from": "url", "index": 1 },
 *     { "name": "campaign", "from": "query", "key": "utm_campaign" },
 *     { "name": "brand", "from": "fixed", "value": "acme" },
 *     { "name": "loggedIn", "from": "function", "key": "isLoggedIn", "describe": "Whether the visitor is signed in" }
 *   ] }
 *
 * `scripts/page-meta.js` is written from it. A function lives in
 * `scripts/page-meta-custom.js`, which belongs to the project: the kit creates
 * it once and adds a stub per new function, and the agent writes its body.
 */

import { z } from "zod";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** A metadata or query parameter name: what a page's metadata block or a URL can hold. */
const KEY = /^[\w:.-]{1,60}$/;

const propertySchema = z
	.object({
		name: z.string().regex(IDENTIFIER, "a property name is a JS identifier, e.g. pageType"),
		from: z.enum(["meta", "url", "query", "fixed", "function"]),
		key: z.string().optional(),
		index: z.number().int().min(1).max(10).optional(),
		value: z.string().max(200).optional(),
		/** For a function: what it returns, in words, for the agent that writes it. */
		describe: z.string().max(500).optional(),
		required: z.boolean().optional(),
		allowed: z.array(z.string().max(100)).max(50).optional(),
	})
	.superRefine((p, ctx) => {
		const need = (ok: boolean, message: string) => {
			if (!ok) ctx.addIssue({ code: "custom", message: `${p.name}: ${message}` });
		};
		if (p.from === "meta" || p.from === "query")
			need(
				KEY.test(p.key ?? ""),
				`"key" names the ${p.from === "meta" ? "metadata field" : "query parameter"}`,
			);
		if (p.from === "function")
			need(IDENTIFIER.test(p.key ?? ""), `"key" names the function, e.g. isLoggedIn`);
		if (p.from === "url") need(p.index !== undefined, `"index" is the URL part, 1 for the first`);
		if (p.from === "fixed") need(p.value !== undefined, `"value" is the fixed value`);
	});

const pageMetaSchema = z.object({ properties: z.array(propertySchema).max(40).default([]) });
type PageMetaProperty = z.infer<typeof propertySchema>;
type PageMetaConfig = z.infer<typeof pageMetaSchema>;

/** The config's pageMeta, checked; throws with what is wrong. */
export function parsePageMeta(raw: unknown): PageMetaConfig {
	const r = pageMetaSchema.safeParse(raw ?? {});
	if (!r.success)
		throw new Error(`pageMeta in .edsrc.json: ${r.error.issues.map((i) => i.message).join("; ")}`);
	const names = new Set<string>();
	for (const p of r.data.properties) {
		if (names.has(p.name)) throw new Error(`pageMeta in .edsrc.json: "${p.name}" is listed twice.`);
		names.add(p.name);
	}
	return r.data;
}

/** The functions the config names, in order, each once. */
export const functionNames = (c: PageMetaConfig) => [
	...new Set(c.properties.filter((p) => p.from === "function").map((p) => p.key as string)),
];

/** How a property's value is read in the browser (JSON keeps every string a safe literal). */
function valueJs(p: PageMetaProperty): string {
	const s = JSON.stringify;
	switch (p.from) {
		case "meta":
			return `meta(${s(p.key)})`;
		case "url":
			return `urlPart(${p.index})`;
		case "query":
			return `query(${s(p.key)})`;
		case "fixed":
			return s(p.value ?? "");
		case "function":
			return `await run(${s(p.key)}, custom.${p.key})`;
	}
}

export const GENERATED_MARK = "// Written by `eds track page` from pageMeta in .edsrc.json.";

/** scripts/page-meta.js: the base fields, then the team's properties. */
export function pageMetaJs(c: PageMetaConfig): string {
	const fns = functionNames(c);
	const lines = c.properties.map((p) => `      ${p.name}: ${valueJs(p)},`);
	return `// scripts/page-meta.js - pushed first, before GTM loads, so every tag sees the page.
${GENERATED_MARK} Change the properties there
// (or in aem-eds-studio's Overview), not here: this file is written again.
import { trackEvent } from './data-layers.js';
${fns.length ? "import * as custom from './page-meta-custom.js';\n" : ""}
function meta(name) {
  const el = document.querySelector(\`meta[name="\${name}"], meta[property="\${name}"]\`);
  return el ? el.content : '';
}

function urlPart(n) {
  return window.location.pathname.split('/').filter(Boolean)[n - 1] || '';
}

function query(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

function environment() {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'dev';
  if (h.endsWith('.aem.page') || h.endsWith('.hlx.page')) return 'preview';
  if (h.endsWith('.aem.live') || h.endsWith('.hlx.live')) return 'live';
  return 'production';
}
${
	fns.length
		? `
// A custom function gets 200 ms: a slow or broken one leaves its property empty,
// and page_meta and GTM still load. On a preview its error shows in the console.
async function run(name, fn) {
  try {
    const timeout = new Promise((resolve) => { setTimeout(() => resolve(undefined), 200); });
    return await Promise.race([Promise.resolve().then(fn), timeout]);
  } catch (e) {
    if (environment() !== 'live' && environment() !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[page_meta]', name, e);
    }
    return undefined;
  }
}
`
		: ""
}
export default async function pageMetaPush() {
  const pageMeta = {
    event: 'page_meta',
    page: {
      path: window.location.pathname,
      title: document.title,
      template: meta('template'),
      theme: meta('theme'),
      language: document.documentElement.lang || '',
      environment: environment(),
      referrer: document.referrer,
${lines.join("\n")}${lines.length ? "\n" : ""}    },
  };
  trackEvent(pageMeta);
  return pageMeta;
}
`;
}

/** The start of scripts/page-meta-custom.js, the project's own functions. */
export const CUSTOM_HEADER = `// scripts/page-meta-custom.js - the project's own page_meta values, one function each.
// Each runs on every page before GTM: keep it fast (it gets 200 ms) and return a
// string, number or boolean. \`eds track page-function <name> "<what it returns>"\`
// lets the agent write one; you can edit them by hand too.
`;

/** A function's stub, until the agent (or a developer) writes it. */
const stub = (name: string, describe?: string) =>
	`
/** ${describe ? describe.replace(/\*\//g, "* /") : "TODO: what this returns."} */
export function ${name}() {
  return undefined;
}
`;

/** Where `export function <name>` starts and ends in the custom file; null when it isn't there. */
export function functionSpan(js: string, name: string): { start: number; end: number } | null {
	const m = new RegExp(
		`(?:\\/\\*\\*[^]*?\\*\\/\\s*)?export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`,
	).exec(js);
	if (!m) return null;
	let i = js.indexOf("{", m.index + m[0].length);
	if (i < 0) return null;
	let depth = 0;
	for (; i < js.length; i++) {
		if (js[i] === "{") depth++;
		else if (js[i] === "}" && --depth === 0) return { start: m.index, end: i + 1 };
	}
	return null;
}

/** The custom file with a stub for each function it doesn't have yet. */
export function withStubs(js: string, c: PageMetaConfig): string {
	let out = js || CUSTOM_HEADER;
	for (const p of c.properties)
		if (p.from === "function" && !functionSpan(out, p.key as string))
			out = `${out.replace(/\s*$/, "\n")}${stub(p.key as string, p.describe)}`;
	return out;
}

/** Put the agent's function in place of the old one (or at the end). */
export function replaceFunction(js: string, name: string, code: string): string {
	const span = functionSpan(js, name);
	const body = code.trim();
	if (!span) return `${(js || CUSTOM_HEADER).replace(/\s*$/, "\n")}\n${body}\n`;
	return `${js.slice(0, span.start)}${body}${js.slice(span.end)}`;
}

export function buildFunctionPrompt(name: string, describe: string): string {
	return [
		`Write one JavaScript function for an Edge Delivery Services site: \`export function ${name}()\`.`,
		`It returns: ${describe}`,
		"",
		"It runs in the browser on every page, before Google Tag Manager loads, and its value goes into the page_meta data layer event.",
		"- Return a string, number or boolean (or a Promise of one). Return undefined when the value isn't known.",
		"- It must be fast: it gets 200 ms. No heavy work, no waiting on other scripts, and a network call only if the description asks for one.",
		"- Read what the page already has: document, window.location, cookies, localStorage, meta tags. Never throw on missing data.",
		"- Plain modern JavaScript, no imports, no other functions outside it, and a one-line /** comment */ above it saying what it returns.",
		"Reply with the function only: no explanation, no code fence.",
	].join("\n");
}

/** The function from the agent's reply; null when it isn't `export function <name>`. */
export function functionFrom(reply: string, name: string): string | null {
	const code = reply
		.trim()
		.replace(/^```(?:js|javascript)?\n([\s\S]*?)\n```$/, "$1")
		.trim();
	const span = functionSpan(code, name);
	return span ? code.slice(span.start, span.end) : null;
}

/** A page's problems against the config's rules, from its <meta> tags. */
export function pageProblems(html: string, c: PageMetaConfig): string[] {
	const metas = new Map<string, string>();
	for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
		const tag = m[0];
		const key = /(?:name|property)="([^"]+)"/i.exec(tag)?.[1];
		const content = /content="([^"]*)"/i.exec(tag)?.[1];
		if (key && content !== undefined) metas.set(key.toLowerCase(), content.trim());
	}
	const problems: string[] = [];
	for (const p of c.properties) {
		if (p.from !== "meta") continue;
		const value = metas.get((p.key as string).toLowerCase()) ?? "";
		if (!value) {
			if (p.required) problems.push(`${p.key} missing`);
		} else if (p.allowed?.length && !p.allowed.includes(value))
			problems.push(`${p.key} "${value}" isn't allowed (${p.allowed.join(", ")})`);
	}
	return problems;
}
