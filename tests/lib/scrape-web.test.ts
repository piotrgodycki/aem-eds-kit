import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { scrapeWebDesign } from "../../src/lib/scrape/web.js";

const page = pathToFileURL(path.resolve(__dirname, "../fixtures/scrape/sections.html")).href;

// biome-ignore lint/suspicious/noExplicitAny: scraped spec tree
function find(node: any, cls: string): any {
	if (node.class?.split(" ").includes(cls)) return node;
	for (const child of node.children ?? []) {
		const hit = find(child, cls);
		if (hit) return hit;
	}
	return null;
}

describe("scrapeWebDesign", () => {
	it("records inherited backgrounds and one-sided borders", async ({ skip }) => {
		let raw: string;
		try {
			raw = await scrapeWebDesign({ url: page, provider: "web" });
		} catch (e) {
			// No Playwright / Chromium on this machine (e.g. CI): nothing to check.
			if (/Playwright|Chromium|Executable/i.test(String(e))) return skip();
			throw e;
		}
		const root = JSON.parse(raw).root;

		// The cards band paints nothing itself: the page background shows through.
		const cards = find(root, "cards");
		expect(cards.style.background).toBeUndefined();
		expect(cards.style.inheritedBackground).toBe("rgb(246, 245, 241)");

		// A band with its own background doesn't get one.
		const stats = find(root, "stats");
		expect(stats.style.inheritedBackground).toBeUndefined();
		// A bottom rule only: the `border` shorthand is empty, the side survives.
		expect(stats.style.borderBottom).toBe("1px solid rgb(220, 218, 211)");
		expect(stats.style.border).toBeUndefined();

		// A uniform border stays a shorthand; "0px none" borders are dropped.
		expect(find(root, "card").style.border).toBe("1px solid rgb(220, 218, 211)");
		expect(JSON.stringify(root)).not.toContain("0px none");
	}, 60000);
});
