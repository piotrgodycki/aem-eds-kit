import { describe, expect, it } from "vitest";
import { integrationById } from "../../src/lib/integrations.js";
import {
	COMPONENTS_JS,
	PAGE_META_JS,
	dataLayersJs,
	delayedSnippet,
	patchAnalytics,
	stripGtmStart,
	validLayers,
} from "../../src/lib/track-page.js";

const gtm = integrationById("gtm");
const gtmModules = gtm?.module?.({ id: "GTM-ABC1234" }) ?? [];
const gtmAnalytics = gtmModules.find((m) => m.file === "scripts/analytics.js")?.content ?? "";

describe("eds track page", () => {
	it("takes several data layers, defaults to dataLayer and refuses non-identifiers", () => {
		expect(validLayers([])).toEqual(["dataLayer"]);
		expect(validLayers(["dataLayer", "adobeDataLayer", "dataLayer", " siteLayer "])).toEqual([
			"dataLayer",
			"adobeDataLayer",
			"siteLayer",
		]);
		expect(() => validLayers(["data-layer"])).toThrow(/valid data layer name/);
		expect(() => validLayers(["x;alert(1)"])).toThrow();
	});

	it("pushes each event to every layer", () => {
		const js = dataLayersJs(["dataLayer", "adobeDataLayer"]);
		expect(js).toContain('export const LAYERS = ["dataLayer","adobeDataLayer"]');
		expect(js).toContain("export function trackEvent(event)");
		expect(js).toContain("LAYERS.forEach((name) => window[name].push(");
	});

	it("identifies the header, footer, sections and blocks and reports views and clicks", () => {
		for (const s of [
			"querySelectorAll('header, footer')",
			"main > .section",
			".block[data-block-name]",
			"data-component-id",
			"event: 'component_view'",
			"event: 'component_click'",
			"new MutationObserver",
			"IntersectionObserver",
		])
			expect(COMPONENTS_JS).toContain(s);
	});

	it("pushes page_meta with the page's context", () => {
		expect(PAGE_META_JS).toContain("import { trackEvent } from './data-layers.js'");
		expect(PAGE_META_JS).toContain("event: 'page_meta'");
		expect(PAGE_META_JS).toContain("template: meta('template')");
	});

	it("starts in the delayed phase: page meta, then GTM, then the components", () => {
		expect(delayedSnippet(true)).toContain(
			"pageMetaPush().then(loadGTM).then(() => initComponents(document));",
		);
		expect(delayedSnippet(false)).toContain("pageMetaPush().then(() => initComponents(document));");
		expect(delayedSnippet(false)).not.toContain("loadGTM");
	});

	it("points the GTM integration's analytics.js at every layer, once", () => {
		const first = patchAnalytics(gtmAnalytics);
		expect(first.changed).toBe(true);
		expect(first.js).toContain("export { trackEvent } from './data-layers.js';");
		expect(first.js).not.toMatch(/export function trackEvent/);
		expect(first.js).toContain("export function loadGTM");
		expect(patchAnalytics(first.js).changed).toBe(false);
	});

	it("removes the GTM integration's own page-meta start so page_meta isn't pushed twice", () => {
		const snippet = gtm?.code({}) ?? "";
		const out = stripGtmStart(snippet);
		expect(out).not.toContain("pageMetaPush");
		expect(out).not.toContain("loadGTM");
	});
});
