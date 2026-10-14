/**
 * Headless-Chromium design scraper for **web-rendered** design sources (Framer,
 * Google Stitch, any live HTML page). Unlike Figma — which paints to a WebGL
 * `<canvas>` and exposes nothing scrapeable — these sources render real DOM, so
 * Playwright can read **computed** layout, typography, colours and geometry
 * straight off the page and serialize them into the same `design.json` shape the
 * rest of the fetch→cache→generate pipeline consumes.
 *
 * Playwright is an optional dependency (shared with `eds block test`/`check`); we
 * import it lazily and fail with an actionable message when it (or its browser)
 * isn't installed.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DesignProvider } from "../figma/prompt-builder.js";

export interface ScrapeOptions {
	url: string;
	provider: DesignProvider;
	/** Viewport width for the capture (design frame width). Default 1440. */
	width?: number;
	/** Project root — also searched for a locally-installed Playwright. */
	projectRoot?: string;
}

// Minimal structural types for the slice of Playwright we use. Playwright is an
// optional dependency and may be absent at build/type-check time, so we don't
// import its types — we load it through a non-literal specifier (kept external).
interface PwPage {
	goto(url: string, opts: { waitUntil?: string; timeout?: number }): Promise<unknown>;
	waitForTimeout(ms: number): Promise<void>;
	// biome-ignore lint/suspicious/noExplicitAny: in-page fn + result are structural
	evaluate(fn: (arg: any) => any, arg: any): Promise<any>;
}
interface PwBrowser {
	newPage(opts: {
		viewport: { width: number; height: number };
		deviceScaleFactor?: number;
	}): Promise<PwPage>;
	close(): Promise<void>;
}
interface PwChromium {
	launch(opts: { headless: boolean }): Promise<PwBrowser>;
}

/**
 * Lazily load Playwright's chromium. The CLI is often installed **globally**, so
 * a `playwright` the user added to **their project** (`npm i -D playwright`) isn't
 * resolvable from the bundle's own location — we therefore also resolve it from
 * the project root / cwd before giving up with an actionable error.
 */
async function loadChromium(projectRoot?: string): Promise<PwChromium> {
	// 1) Resolve from the CLI's own install (optionalDependencies / global).
	try {
		const specifier = "playwright"; // non-literal → stays an external runtime import
		const pw = (await import(specifier)) as { chromium: PwChromium };
		return pw.chromium;
	} catch {
		// fall through to the project-local lookup
	}

	// 2) Resolve from the user's project (where they likely ran `npm i -D playwright`).
	const searchPaths = [projectRoot, process.cwd()].filter((p): p is string => Boolean(p));
	if (searchPaths.length) {
		try {
			const req = createRequire(pathToFileURL(path.join(searchPaths[0], "package.json")).href);
			const entry = req.resolve("playwright", { paths: searchPaths });
			const pw = (await import(pathToFileURL(entry).href)) as { chromium: PwChromium };
			return pw.chromium;
		} catch {
			// fall through to the error
		}
	}

	throw new Error(
		"Scraping needs Playwright. Install it in your project (`npm i -D playwright`) or globally (`npm i -g playwright`), then `npx playwright install chromium`.",
	);
}

/**
 * Open `url` in headless Chromium and extract a compact, structured design spec
 * from the rendered DOM. Returns pretty-printed JSON (the cached snapshot).
 */
export async function scrapeWebDesign(opts: ScrapeOptions): Promise<string> {
	const width = opts.width ?? 1440;
	const chromium = await loadChromium(opts.projectRoot);

	let browser: PwBrowser;
	try {
		browser = await chromium.launch({ headless: true });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/Executable doesn't exist|install/i.test(msg)) {
			throw new Error(
				"Chromium isn't installed for Playwright. Run `npx playwright install chromium`.",
			);
		}
		throw e;
	}

	try {
		const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
		await page.goto(opts.url, { waitUntil: "networkidle", timeout: 45000 });
		// Let webfonts settle and above-the-fold entrance animations finish.
		await page.waitForTimeout(700);

		const captured = (await page.evaluate(extractDesign, {
			maxNodes: 320,
			maxDepth: 14,
			textCap: 200,
		})) as { title: string; root: unknown; nodeCount: number; truncated: boolean };

		const spec = {
			source: `scrape:${opts.provider}`,
			url: opts.url,
			viewport: width,
			title: captured.title,
			root: captured.root,
			nodeCount: captured.nodeCount,
			truncated: captured.truncated,
		};
		return JSON.stringify(spec, null, 2);
	} finally {
		await browser.close();
	}
}

/**
 * Runs **in the browser** (serialized by Playwright). Walks the rendered DOM and
 * records visible elements with their computed styles, geometry and text. Kept
 * self-contained (no outside references) and bounded (node/ depth caps) so the
 * embedded spec stays prompt-sized.
 */
function extractDesign(cfg: { maxNodes: number; maxDepth: number; textCap: number }) {
	const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "HEAD", "BR", "TEMPLATE"]);
	let count = 0;
	let truncated = false;

	const clean = (v: string) =>
		!v ||
		v === "none" ||
		v === "normal" ||
		v === "auto" ||
		v === "0px" ||
		v === "rgba(0, 0, 0, 0)" ||
		v === "transparent";

	function directText(el: Element): string {
		let t = "";
		for (const n of Array.from(el.childNodes)) {
			if (n.nodeType === 3) t += n.textContent ?? "";
		}
		t = t.replace(/\s+/g, " ").trim();
		return t.length > cfg.textCap ? `${t.slice(0, cfg.textCap)}…` : t;
	}

	function styleOf(el: Element) {
		const cs = getComputedStyle(el);
		const s: Record<string, string> = {};
		const put = (k: string, v: string) => {
			if (!clean(v)) s[k] = v;
		};
		put("display", cs.display);
		if (cs.display.includes("flex") || cs.display.includes("grid")) {
			put("flexDirection", cs.flexDirection);
			put("justifyContent", cs.justifyContent);
			put("alignItems", cs.alignItems);
			put("gap", cs.gap);
		}
		put("padding", cs.padding);
		put("margin", cs.margin);
		put("color", cs.color);
		put("background", cs.backgroundColor);
		if (cs.backgroundImage && cs.backgroundImage !== "none")
			s.backgroundImage = cs.backgroundImage.slice(0, 160);
		put("fontFamily", cs.fontFamily);
		put("fontSize", cs.fontSize);
		put("fontWeight", cs.fontWeight);
		put("lineHeight", cs.lineHeight);
		put("letterSpacing", cs.letterSpacing);
		put("textAlign", cs.textAlign);
		put("border", cs.border);
		put("borderRadius", cs.borderRadius);
		put("boxShadow", cs.boxShadow);
		if (cs.opacity && cs.opacity !== "1") s.opacity = cs.opacity;
		if (cs.position && cs.position !== "static") s.position = cs.position;
		return s;
	}

	// biome-ignore lint/suspicious/noExplicitAny: in-page tree node, structural
	function walk(el: Element, depth: number): any {
		if (count >= cfg.maxNodes) {
			truncated = true;
			return null;
		}
		if (SKIP.has(el.tagName)) return null;
		const rect = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		const invisible =
			cs.display === "none" ||
			cs.visibility === "hidden" ||
			cs.opacity === "0" ||
			rect.width < 1 ||
			rect.height < 1;
		if (invisible) return null;

		count++;
		// biome-ignore lint/suspicious/noExplicitAny: structural node
		const node: any = {
			tag: el.tagName.toLowerCase(),
			rect: {
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				w: Math.round(rect.width),
				h: Math.round(rect.height),
			},
		};
		const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 3);
		if (cls.length) node.class = cls.join(" ");
		const style = styleOf(el);
		if (Object.keys(style).length) node.style = style;

		if (el.tagName === "IMG") {
			const img = el as HTMLImageElement;
			node.img = {
				src: (img.currentSrc || img.src || "").slice(0, 200),
				alt: img.alt || "",
				w: img.naturalWidth,
				h: img.naturalHeight,
			};
		}

		const txt = directText(el);
		if (txt) node.text = txt;

		if (depth < cfg.maxDepth) {
			const kids = [];
			for (const child of Array.from(el.children)) {
				const c = walk(child, depth + 1);
				if (c) kids.push(c);
			}
			if (kids.length) node.children = kids;
		}
		return node;
	}

	const root = walk(document.body, 0);
	return { title: document.title, root, nodeCount: count, truncated };
}
