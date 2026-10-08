import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Repo-relative path of the generated helpers module. */
export const HELPERS_PATH = "scripts/utils.js";

export interface Helper {
	id: string;
	label: string;
	/** Other helper ids this one needs (pulled in automatically). */
	deps?: string[];
	/** The function source (with JSDoc). */
	code: string;
}

/**
 * The catalog of common EDS helpers. `eds scaffold helpers` lets the user tick
 * which ones to generate; dependencies are included automatically.
 */
export const HELPERS: Helper[] = [
	{
		id: "getMetadata",
		label: "getMetadata (read a page meta value)",
		code: `/**
 * Reads a page metadata value by name (meta[name] or meta[property]).
 * @param {string} name The metadata name.
 * @returns {string} The value, or an empty string.
 */
export function getMetadata(name) {
  const meta =
    document.querySelector(\`meta[name="\${name}"]\`) ||
    document.querySelector(\`meta[property="\${name}"]\`);
  return meta ? meta.content : '';
}`,
	},
	{
		id: "toCamelCase",
		label: "toCamelCase (dash/underscore/space -> camelCase)",
		code: `/**
 * Converts a string to camelCase, handling dashes, underscores and spaces.
 * @param {string} value The string to convert.
 * @returns {string} The camelCased string.
 */
export function toCamelCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_\\s]+(.)/g, (_, char) => char.toUpperCase());
}`,
	},
	{
		id: "getLanguageRootPath",
		label: "getLanguageRootPath (e.g. /en, /en-us)",
		code: `/**
 * Returns the language root of a path, e.g. '/en' or '/en-us' ('' if none).
 * @param {string} path The page path.
 * @returns {string} The language root prefix.
 */
export function getLanguageRootPath(path) {
  const match = String(path || '').match(/^\\/[a-z]{2}(?:-[a-z]{2})?(?=\\/|$)/i);
  return match ? match[0] : '';
}`,
	},
	{
		id: "getPagePath",
		label: "getPagePath (path without content root)",
		deps: ["getLanguageRootPath"],
		code: `// Content root stripped from page paths. Set this if your site is mounted under
// a sub-path (e.g. '/content/my-site'); leave empty for a root-mounted site.
const ROOT_PATH = '';

/**
 * Returns the page path without the content root; \`clean\` drops the language root.
 * @param {boolean} [clean=false] Also strip the language root.
 * @returns {string} The page path or 'NA' for the language root.
 */
export function getPagePath({ clean = false } = {}) {
  const path = window.location.pathname.replace(ROOT_PATH, '').replace(/\\.html$/i, '');

  if (clean) {
    const langRoot = getLanguageRootPath(path);
    const cleaned = path.startsWith(langRoot) ? path.slice(langRoot.length) : path;
    return cleaned || 'NA';
  }

  return path || 'NA';
}`,
	},
	{
		id: "getSiteArea",
		label: "getSiteArea (blog / products / home)",
		deps: ["getPagePath"],
		code: `/**
 * Returns the top-level area of the site from the current path - e.g. 'blog' or
 * 'products', and 'home' at the site root. Uses the language-cleaned path, so you
 * can tell whether you're on the blog or somewhere else.
 * @returns {string} The site area.
 */
export function getSiteArea() {
  const path = getPagePath({ clean: true });
  if (!path || path === 'NA') return 'home';
  return path.split('/').filter(Boolean)[0] || 'home';
}`,
	},
	{
		id: "getEnvironment",
		label: "getEnvironment (dev / stage / prod)",
		code: `/**
 * Detects the current environment from the hostname.
 * @returns {'NA'|'dev'|'stage'|'prod'} The environment name.
 */
export function getEnvironment() {
  const { hostname } = window.location;
  if (hostname.includes('author')) return 'NA';
  if (hostname === 'localhost') return 'dev';
  const repo = hostname.match(/^[^.]+--([^.]+)--[^.]+\\.aem\\.(?:page|live)$/)?.[1] || '';
  if (repo.includes('dev')) return 'dev';
  if (repo.includes('stage')) return 'stage';
  return 'prod';
}`,
	},
	{
		id: "getContentTopic",
		label: "getContentTopic (cq-tags content-topic values)",
		deps: ["getMetadata"],
		code: `/**
 * Reads all content-topic values from the page's cq-tags metadata.
 * @returns {string[]} The topics (part after \`content-topic/\`), empty if none.
 */
export function getContentTopic() {
  return getMetadata('cq-tags')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.includes('content-topic/'))
    .map((t) => t.split('content-topic/')[1]);
}`,
	},
	{
		id: "isUEEdit",
		label: "isUEEdit (Universal Editor edit mode)",
		code: `/**
 * Checks whether the current page is opened in the Universal Editor Edit mode.
 * @returns {boolean} True in Universal Editor Edit mode.
 */
export function isUEEdit() {
  return document.documentElement.classList.contains('adobe-ue-edit');
}`,
	},
	{
		id: "isUEPreview",
		label: "isUEPreview (Universal Editor preview mode)",
		code: `/**
 * Checks whether the current page is opened in the Universal Editor Preview mode.
 * @returns {boolean} True in Universal Editor Preview mode.
 */
export function isUEPreview() {
  return document.documentElement.classList.contains('adobe-ue-preview');
}`,
	},
	{
		id: "isUE",
		label: "isUE (Universal Editor, any mode)",
		deps: ["isUEEdit", "isUEPreview"],
		code: `/**
 * Checks whether the current page is opened in the Universal Editor (any mode).
 * @returns {boolean} True in the Universal Editor.
 */
export function isUE() {
  return isUEEdit() || isUEPreview();
}`,
	},
];

/** All helper ids (the default selection). */
export const ALL_HELPER_IDS = HELPERS.map((h) => h.id);

export function helperById(id: string): Helper | undefined {
	return HELPERS.find((h) => h.id === id);
}

/** Resolve the selection + its transitive dependencies (order-preserving). */
export function resolveHelpers(ids: string[]): string[] {
	const want = new Set<string>();
	const add = (id: string) => {
		if (want.has(id)) return;
		const h = helperById(id);
		if (!h) return;
		for (const dep of h.deps ?? []) add(dep);
		want.add(id);
	};
	for (const id of ids) add(id);
	// Emit in catalog order (deps are defined before their dependents).
	return HELPERS.filter((h) => want.has(h.id)).map((h) => h.id);
}

/** Compose `scripts/utils.js` from the selected helpers (+ deps). */
export function buildHelpers(ids: string[]): string {
	const resolved = resolveHelpers(ids);
	const body = resolved
		.map((id) => helperById(id))
		.filter((h): h is Helper => !!h)
		.map((h) => h.code)
		.join("\n\n");
	return `// scripts/utils.js - common EDS helpers (generated by \`eds scaffold helpers\`).\n\n${body}\n`;
}

export interface HelpersResult {
	path: string;
	created: boolean;
	/** The helper ids actually written (selection + deps). */
	helpers: string[];
}

/** Write `scripts/utils.js` with the chosen helpers. Never overwrites. */
export async function writeHelpers(
	projectRoot: string,
	ids: string[] = ALL_HELPER_IDS,
): Promise<HelpersResult> {
	const resolved = resolveHelpers(ids);
	const file = path.join(projectRoot, "scripts", "utils.js");
	if (existsSync(file)) return { path: HELPERS_PATH, created: false, helpers: resolved };
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, buildHelpers(ids));
	return { path: HELPERS_PATH, created: true, helpers: resolved };
}
