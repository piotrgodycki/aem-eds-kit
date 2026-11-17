import { describe, expect, it } from "vitest";
import { gtmSheet, integrationById } from "../../src/lib/integrations.js";

describe("GTM integration", () => {
	const gtm = integrationById("gtm");
	const modules = gtm?.module?.({ sheet: "/analytics" }) ?? [];
	const byFile = (f: string) => modules.find((m) => m.file === f)?.content ?? "";

	it("ships analytics.js with fixed, reusable helpers", () => {
		const c = byFile("scripts/analytics.js");
		// Initialises the dataLayer (the bug the old snippet had).
		expect(c).toContain("window.dataLayer = window.dataLayer || []");
		expect(c).toContain("export function trackEvent");
		expect(c).toContain("export async function loadGTM");
		// The id comes from the page's metadata, else the sheet in the content tree; none in code.
		expect(c).toContain("getMetadata('gtm-id') || (await sheetValue(GTM_SHEET, 'gtm-id'))");
		expect(c).toContain('const GTM_SHEET = "/analytics"');
		expect(c).not.toMatch(/GTM-[A-Z0-9]{4,}/);
		// Modern + idempotent, and no dead noscript iframe.
		expect(c).toContain("Date.now()");
		expect(c).toContain("if (loaded) return");
		expect(c).not.toContain("noscript");
		// pageMetaPush lives in its own file now.
		expect(c).not.toContain("pageMetaPush");
	});

	it("ships page-meta.js with a default-exported pageMetaPush", () => {
		const c = byFile("scripts/page-meta.js");
		expect(c).toContain("import { trackEvent } from './analytics.js'");
		expect(c).toContain("export default async function pageMetaPush");
		expect(c).toContain("event: 'page_meta'");
	});

	it("wires delayed.js to import both and push page meta before GTM", () => {
		const code = gtm?.code({ sheet: "/analytics" }) ?? "";
		expect(code).toContain("import { loadGTM } from './analytics.js'");
		expect(code).toContain("import pageMetaPush from './page-meta.js'");
		expect(code).toContain("pageMetaReady.then(loadGTM)");
	});

	it("keeps the sheet's path to one the site serves", () => {
		expect(gtmSheet("config.json")).toBe("/config");
		expect(gtmSheet("/settings/analytics/")).toBe("/settings/analytics");
		expect(gtmSheet("")).toBe("/analytics");
		expect(gtmSheet("../x")).toBe("/analytics");
		expect(gtmSheet('/a"; alert(1)')).toBe("/analytics");
	});
});
