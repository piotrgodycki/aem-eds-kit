import { describe, expect, it } from "vitest";
import { integrationById } from "../../src/lib/integrations.js";

describe("GTM integration", () => {
	const gtm = integrationById("gtm");
	const modules = gtm?.module?.({ id: "GTM-ABC1234" }) ?? [];
	const byFile = (f: string) => modules.find((m) => m.file === f)?.content ?? "";

	it("ships analytics.js with fixed, reusable helpers", () => {
		const c = byFile("scripts/analytics.js");
		// Initialises the dataLayer (the bug the old snippet had).
		expect(c).toContain("window.dataLayer = window.dataLayer || []");
		expect(c).toContain("export function trackEvent");
		expect(c).toContain("export function loadGTM");
		// Reads the id from metadata with the configured fallback.
		expect(c).toContain("getMetadata('gtm-id')");
		expect(c).toContain('"GTM-ABC1234"');
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
		const code = gtm?.code({ id: "GTM-ABC1234" }) ?? "";
		expect(code).toContain("import { loadGTM } from './analytics.js'");
		expect(code).toContain("import pageMetaPush from './page-meta.js'");
		expect(code).toContain("pageMetaReady.then(loadGTM)");
	});
});
