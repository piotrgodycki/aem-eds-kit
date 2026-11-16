import { describe, expect, it } from "vitest";
import { bundlesUrl, p75, type RumBundle, summarizeRum } from "../../src/lib/rum.js";

const bundle = (
	url: string,
	ua: string,
	weight: number,
	lcp?: number,
	inp?: number,
	cls?: number,
): RumBundle => ({
	url,
	userAgent: ua,
	weight,
	events: [
		...(lcp !== undefined ? [{ checkpoint: "cwv-lcp", value: lcp }] : []),
		...(inp !== undefined ? [{ checkpoint: "cwv-inp", value: inp }] : []),
		...(cls !== undefined ? [{ checkpoint: "cwv-cls", value: cls }] : []),
		{ checkpoint: "enter" },
	],
});

describe("RUM Core Web Vitals", () => {
	it("takes the 75th percentile weighted by page views", () => {
		expect(p75([])).toBeNull();
		expect(
			p75([
				{ value: 1, weight: 100 },
				{ value: 9, weight: 100 },
				{ value: 2, weight: 100 },
				{ value: 3, weight: 100 },
			]),
		).toBe(3);
		// One bundle standing for most page views decides it.
		expect(
			p75([
				{ value: 5000, weight: 900 },
				{ value: 1000, weight: 100 },
			]),
		).toBe(5000);
	});

	it("counts mobile only, by default, with good, needs work and poor shares", () => {
		const s = summarizeRum(
			[
				bundle("https://www.example.com/", "mobile:ios", 100, 1800, 150, 0.02),
				bundle("https://www.example.com/", "mobile:android", 100, 3000, 300, 0.05),
				bundle("https://www.example.com/offers/winter", "mobile:android", 200, 4300, 280, 0.01),
				bundle("https://www.example.com/", "desktop:windows", 1000, 900, 50, 0),
			],
			"mobile",
		);
		expect(s.pageViews).toBe(400);
		expect(s.lcp.good).toBeCloseTo(0.25);
		expect(s.lcp.ni).toBeCloseTo(0.25);
		expect(s.lcp.poor).toBeCloseTo(0.5);
		expect(s.cls.good).toBe(1);
		expect(s.pages[0]).toMatchObject({ path: "/offers/winter", views: 200, lcp: 4300 });
		expect(
			summarizeRum([bundle("https://x.com/", "desktop:mac", 100, 900)], "mobile").pageViews,
		).toBe(0);
	});

	it("reads one day of bundles", () => {
		expect(
			bundlesUrl("https://bundles.aem.page/", "www.example.com", new Date(Date.UTC(2026, 0, 5))),
		).toBe("https://bundles.aem.page/bundles/www.example.com/2026/01/05");
	});
});
