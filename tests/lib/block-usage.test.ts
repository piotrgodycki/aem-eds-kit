import { describe, expect, it } from "vitest";
import {
	blockOfSource,
	blocksInPage,
	blockTraffic,
	countPages,
	indexPaths,
} from "../../src/lib/block-usage.js";
import type { RumBundle } from "../../src/lib/rum.js";

const known = new Set(["hero", "cards", "header", "footer", "widget"]);

describe("block usage", () => {
	it("finds the blocks in a page's plain HTML by their first class", () => {
		const html =
			'<div><div class="hero dark"><div><div>Hi</div></div></div></div><div><div class="cards"><div></div></div><div class="section-metadata"></div></div>';
		expect([...blocksInPage(html, known)].sort()).toEqual(["cards", "hero"]);
	});

	it("counts header and footer on every page, and an unused block as 0", () => {
		const counts = countPages(
			[new Set(["hero"]), new Set(["hero", "cards"]), new Set()],
			["hero", "cards", "header", "widget"],
		);
		expect(Object.fromEntries(counts)).toEqual({ hero: 2, cards: 1, header: 3, widget: 0 });
	});

	it("names the block an event happened in, by class or by tag", () => {
		expect(blockOfSource(".cards .cards-card-body a", known)).toBe("cards");
		expect(blockOfSource("header .nav-brand a", known)).toBe("header");
		expect(blockOfSource("#main .button", known)).toBeNull();
		expect(blockOfSource(undefined, known)).toBeNull();
	});

	it("weights views and clicks by bundle, each block once per page view", () => {
		const bundle = (weight: number, events: RumBundle["events"]): RumBundle => ({
			url: "https://www.example.com/",
			weight,
			events,
		});
		const traffic = blockTraffic(
			[
				bundle(100, [
					{ checkpoint: "viewblock", source: ".hero" },
					{ checkpoint: "click", source: ".hero a" },
					{ checkpoint: "click", source: ".hero .button" },
					{ checkpoint: "viewblock", source: ".cards" },
				]),
				bundle(100, [{ checkpoint: "viewblock", source: ".hero" }]),
			],
			["hero", "cards"],
		);
		expect(traffic.get("hero")).toEqual({ views: 200, clicks: 100 });
		expect(traffic.get("cards")).toEqual({ views: 100, clicks: 0 });
	});

	it("reads the page paths from a query index", () => {
		expect(indexPaths({ data: [{ path: "/" }, { path: "/about" }, { title: "no path" }] })).toEqual(
			["/", "/about"],
		);
		expect(indexPaths(null)).toEqual([]);
	});
});
