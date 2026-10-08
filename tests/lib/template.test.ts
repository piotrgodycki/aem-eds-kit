import { describe, expect, it } from "vitest";
import { daEditUrl, daSourceUrl } from "../../src/lib/template/da.js";
import { buildPageHtml } from "../../src/lib/template/page.js";

describe("buildPageHtml", () => {
	const html = buildPageHtml({
		title: "Home",
		description: "Welcome",
		blocks: ["hero", "cards"],
		area: "blog",
	});

	it("renders the EDS document shell", () => {
		expect(html).toContain("<body>");
		expect(html).toContain("<main>");
		expect(html).toContain("<h1>Home</h1>");
	});

	it("seeds each chosen block as a div", () => {
		expect(html).toContain('<div class="hero">');
		expect(html).toContain('<div class="cards">');
	});

	it("includes a metadata block with Title / Description / Template", () => {
		expect(html).toContain('<div class="metadata">');
		expect(html).toContain("<div>Title</div><div>Home</div>");
		expect(html).toContain("<div>Description</div><div>Welcome</div>");
		expect(html).toContain("<div>Template</div><div>blog</div>");
	});

	it("works with no blocks", () => {
		const bare = buildPageHtml({ title: "X" });
		expect(bare).toContain("<h1>X</h1>");
		expect(bare).toContain('<div class="metadata">');
	});
});

describe("DA urls", () => {
	it("builds the source and edit urls (path normalised)", () => {
		expect(daSourceUrl("org", "site", "/templates/home")).toBe(
			"https://admin.da.live/source/org/site/templates/home.html",
		);
		expect(daSourceUrl("org", "site", "home.html")).toBe(
			"https://admin.da.live/source/org/site/home.html",
		);
		expect(daEditUrl("org", "site", "/templates/home")).toBe(
			"https://da.live/edit#/org/site/templates/home",
		);
	});
});
