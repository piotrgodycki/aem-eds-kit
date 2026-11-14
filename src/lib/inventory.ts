/**
 * What an Edge Delivery project already has: its kind and content source, its
 * blocks and Universal Editor components, the third parties it loads, its
 * analytics (data layer, page metadata, custom events, tag IDs) and the rest of
 * its setup. Read-only: it only reads files.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface Found {
	name: string;
	/** Project-relative files it was found in. */
	files: string[];
}

interface Inventory {
	kind: "universal-editor" | "document";
	content: { source: string; url?: string } | null;
	blocks: Array<{ name: string; js: boolean; css: boolean; model: boolean; preview: boolean }>;
	components: { definitions: number; models: number; filters: number };
	thirdParties: Found[];
	analytics: {
		dataLayer: Found[];
		events: Found[];
		metadata: Found[];
		rum: Found[];
		ids: Found[];
	};
	setup: Found[];
	styles: { tokens: number; fonts: string[] };
	icons: number;
}

/** Known third parties, by what their loaders or hosts look like in code. */
const THIRD_PARTIES: Array<[name: string, pattern: RegExp]> = [
	["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
	["Google Analytics 4", /googletagmanager\.com\/gtag\/js|gtag\(\s*['"]config['"]/],
	["Adobe Launch / Tags", /assets\.adobedtm\.com/],
	["Adobe Analytics", /\bs_code|AppMeasurement|omtrdc\.net/],
	["Adobe Web SDK (alloy)", /\balloy\(|adobe\/alloy|alloy\.min\.js/],
	["Adobe Target", /\badobe\.target\b|at\.js|tt\.omtrdc\.net/],
	["OneTrust", /cdn\.cookielaw\.org|onetrust/i],
	["Cookiebot", /consent\.cookiebot\.com/i],
	["Usercentrics", /usercentrics/i],
	["Hotjar", /static\.hotjar\.com|hotjar/i],
	["Microsoft Clarity", /clarity\.ms/],
	["Meta Pixel", /connect\.facebook\.net\/[^'"]*fbevents/],
	["LinkedIn Insight", /snap\.licdn\.com/],
	["TikTok Pixel", /analytics\.tiktok\.com/],
	["Intercom", /widget\.intercom\.io|Intercom\(/],
	["Zendesk", /static\.zdassets\.com|zEmbed|zE\(/],
	["Drift", /js\.driftt\.com/],
	["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net/],
	["Marketo", /munchkin\.marketo\.net|mktoForms/i],
	["Salesforce", /force\.com|salesforce/i],
	["YouTube", /youtube(-nocookie)?\.com\/embed|youtu\.be/],
	["Vimeo", /player\.vimeo\.com/],
	["Brightcove", /players\.brightcove\.net/],
	["Adobe Fonts (Typekit)", /use\.typekit\.net/],
	["Google Fonts", /fonts\.googleapis\.com/],
	["Algolia", /algolia/i],
	["Google Maps", /maps\.googleapis\.com/],
	["reCAPTCHA", /google\.com\/recaptcha|grecaptcha/],
	["Stripe", /js\.stripe\.com/],
	["Sentry", /browser\.sentry-cdn\.com|@sentry\//],
	["Optimizely", /cdn\.optimizely\.com/],
	["VWO", /visualwebsiteoptimizer\.com/],
];

/** Setup the project has, by the file or folder that holds it. */
const SETUP: Array<[name: string, rel: string]> = [
	["Experimentation plugin", "plugins/experimentation"],
	["RUM (rum-enhancer / sampleRUM)", "scripts/aem.js"],
	["Delayed loading (delayed.js)", "scripts/delayed.js"],
	["Query index (helix-query.yaml)", "helix-query.yaml"],
	["Sitemap (helix-sitemap.yaml)", "helix-sitemap.yaml"],
	["Redirects (redirects.json/xlsx)", "redirects.json"],
	["Headers (headers.json)", "headers.json"],
	["robots.txt", "robots.txt"],
	["Paths (paths.json)", "paths.json"],
	["Fonts (styles/fonts.css)", "styles/fonts.css"],
	["Lazy styles (styles/lazy-styles.css)", "styles/lazy-styles.css"],
	["ESLint", ".eslintrc.js"],
	["ESLint (flat config)", "eslint.config.js"],
	["Stylelint", ".stylelintrc.json"],
	["GitHub Actions", ".github/workflows"],
	["AEM Code Sync / UE config (xwalk.json)", "xwalk.json"],
	["Content Fragment / AEM author setup (config.json)", "config.json"],
];

const SKIP = new Set(["node_modules", ".git", "tmp", "dist", "build", ".next", "coverage"]);
const CODE = /\.(m?js|html|json|ya?ml|css)$/;
const MAX_BYTES = 512 * 1024;

async function codeFiles(root: string, dir = ""): Promise<string[]> {
	const out: string[] = [];
	const entries = await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
	for (const e of entries) {
		if (SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".github")) continue;
		const rel = dir ? `${dir}/${e.name}` : e.name;
		if (e.isDirectory()) out.push(...(await codeFiles(root, rel)));
		else if (CODE.test(e.name)) out.push(rel);
	}
	return out;
}

/** name → files it was found in, sorted by name. */
class Finds {
	private map = new Map<string, Set<string>>();
	add(name: string, file: string) {
		const files = this.map.get(name) ?? new Set();
		files.add(file);
		this.map.set(name, files);
	}
	list(): Found[] {
		return [...this.map]
			.map(([name, files]) => ({ name, files: [...files].sort() }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}
}

/** Every first capture group of `re` in `text`. */
const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[1]).filter(Boolean);

function contentSource(root: string, fstab: string | null): Inventory["content"] {
	if (!fstab) return null;
	try {
		const y = parseYaml(fstab) as { mountpoints?: Record<string, string | { url?: string }> };
		const first = Object.values(y?.mountpoints ?? {})[0];
		const url = typeof first === "string" ? first : first?.url;
		if (!url) return null;
		const source = /sharepoint\.com/.test(url)
			? "SharePoint"
			: /drive\.google\.com|docs\.google\.com/.test(url)
				? "Google Drive"
				: /content\.da\.live|da\.live/.test(url)
					? "Document Authoring (da.live)"
					: /adobeaemcloud\.com|\/bin\/franklin\.delivery/.test(url)
						? "AEM author (Universal Editor)"
						: "Other";
		return { source, url };
	} catch {
		return null;
	}
}

export async function inspectProject(root: string): Promise<Inventory> {
	const read = async (rel: string) => {
		const file = path.join(root, rel);
		try {
			if ((await stat(file)).size > MAX_BYTES) return null;
			return await readFile(file, "utf-8");
		} catch {
			return null;
		}
	};

	const thirdParties = new Finds();
	const dataLayer = new Finds();
	const events = new Finds();
	const metadata = new Finds();
	const rum = new Finds();
	const ids = new Finds();
	for (const rel of await codeFiles(root)) {
		const text = await read(rel);
		if (!text) continue;
		const isCode = /\.(m?js|html)$/.test(rel);
		for (const [name, re] of THIRD_PARTIES) if (re.test(text)) thirdParties.add(name, rel);
		if (!isCode) continue;
		// Data layer: what is pushed, by event name; the layer itself when only data goes in.
		for (const e of all(/dataLayer\.push\(\s*\{[^}]*?\bevent\s*:\s*['"`]([\w:./-]+)['"`]/g, text))
			dataLayer.add(`dataLayer: ${e}`, rel);
		for (const e of all(
			/adobeDataLayer\.push\(\s*\{[^}]*?\bevent\s*:\s*['"`]([\w:./-]+)['"`]/g,
			text,
		))
			dataLayer.add(`adobeDataLayer: ${e}`, rel);
		if (/\bdataLayer\s*=|window\.dataLayer\b/.test(text)) dataLayer.add("dataLayer (Google)", rel);
		if (/adobeDataLayer/.test(text)) dataLayer.add("adobeDataLayer (Adobe Client Data Layer)", rel);
		for (const e of all(/new CustomEvent\(\s*['"`]([\w:./-]+)['"`]/g, text)) events.add(e, rel);
		for (const e of all(/dispatchEvent\(\s*new Event\(\s*['"`]([\w:./-]+)['"`]/g, text))
			events.add(e, rel);
		for (const m of all(/getMetadata\(\s*['"`]([\w:.-]+)['"`]/g, text)) metadata.add(m, rel);
		for (const m of all(/<meta\s+name=["']([\w:.-]+)["']/g, text)) metadata.add(m, rel);
		for (const r of all(/sampleRUM\(\s*['"`]([\w:.-]+)['"`]/g, text)) rum.add(r, rel);
		for (const id of all(/\b(GTM-[A-Z0-9]{4,10})\b/g, text)) ids.add(id, rel);
		for (const id of all(/\b(G-[A-Z0-9]{6,12})\b/g, text)) ids.add(id, rel);
		for (const id of all(/(assets\.adobedtm\.com\/[\w/.-]+\.js)/g, text)) ids.add(id, rel);
	}

	const blocksDir = path.join(root, "blocks");
	const blocks: Inventory["blocks"] = [];
	for (const e of await readdir(blocksDir, { withFileTypes: true }).catch(() => [])) {
		if (!e.isDirectory()) continue;
		const has = (f: string) => existsSync(path.join(blocksDir, e.name, f));
		blocks.push({
			name: e.name,
			js: has(`${e.name}.js`),
			css: has(`${e.name}.css`),
			model: has(`_${e.name}.json`),
			preview: has(`_${e.name}.preview.html`),
		});
	}
	blocks.sort((a, b) => a.name.localeCompare(b.name));

	const count = async (rel: string, key: string) => {
		const text = await read(rel);
		if (!text) return 0;
		try {
			const j = JSON.parse(text) as Record<string, unknown>;
			if (key === "groups")
				return ((j.groups as Array<{ components?: unknown[] }>) ?? []).reduce(
					(n, g) => n + (g.components?.length ?? 0),
					0,
				);
			return Array.isArray(j) ? j.length : 0;
		} catch {
			return 0;
		}
	};
	const components = {
		definitions: await count("component-definition.json", "groups"),
		models: await count("component-models.json", ""),
		filters: await count("component-filters.json", ""),
	};

	const setup = new Finds();
	for (const [name, rel] of SETUP) {
		if (!existsSync(path.join(root, rel))) continue;
		if (rel === "scripts/aem.js" && !/sampleRUM/.test((await read(rel)) ?? "")) continue;
		setup.add(name, rel);
	}

	const css = (await read("styles/styles.css")) ?? "";
	const fontsCss = `${(await read("styles/fonts.css")) ?? ""}\n${css}`;
	const fonts = [
		...new Set(all(/font-family\s*:\s*['"]?([^;'",]+)/g, fontsCss).map((f) => f.trim())),
	]
		.filter((f) => !/^var\(/.test(f))
		.sort();
	const icons = (await readdir(path.join(root, "icons")).catch(() => [])).filter((f) =>
		f.endsWith(".svg"),
	).length;

	return {
		kind: existsSync(path.join(root, "component-definition.json"))
			? "universal-editor"
			: "document",
		content: contentSource(root, await read("fstab.yaml")),
		blocks,
		components,
		thirdParties: thirdParties.list(),
		analytics: {
			dataLayer: dataLayer.list(),
			events: events.list(),
			metadata: metadata.list(),
			rum: rum.list(),
			ids: ids.list(),
		},
		setup: setup.list(),
		styles: { tokens: new Set(all(/(--[\w-]+)\s*:/g, css)).size, fonts },
		icons,
	};
}
