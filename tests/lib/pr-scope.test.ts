import { describe, expect, it } from "vitest";
import { classifyFiles, pagesForBlocks, scopeMarkdown } from "../../src/lib/pr-scope.js";

describe("pull request scope", () => {
	it("sorts changed files into blocks, shared code, authoring and the rest", () => {
		expect(
			classifyFiles([
				"blocks/hero/hero.js",
				"blocks/hero/_hero.json",
				"blocks/cards/cards.css",
				"styles/styles.css",
				"head.html",
				"component-models.json",
				"README.md",
			]),
		).toEqual({
			blocks: ["cards", "hero"],
			shared: ["styles/styles.css", "head.html"],
			authoring: ["blocks/hero/_hero.json", "component-models.json"],
			other: ["README.md"],
		});
	});

	it("counts a block's pages with a few examples, header on every page", () => {
		const pages = [
			{ path: "/", blocks: new Set(["hero"]) },
			{ path: "/a", blocks: new Set(["hero", "cards"]) },
			{ path: "/b", blocks: new Set<string>() },
		];
		expect(pagesForBlocks(["hero", "header", "widget"], pages, 1)).toEqual([
			{ name: "hero", pages: 2, examples: ["/"] },
			{ name: "header", pages: 3, examples: ["/"] },
			{ name: "widget", pages: 0, examples: [] },
		]);
		expect(pagesForBlocks(["hero"], null)).toEqual([{ name: "hero", pages: null, examples: [] }]);
	});

	it("writes What to test with each page linked on the branch's preview", () => {
		const md = scopeMarkdown(
			classifyFiles(["blocks/hero/hero.js", "styles/styles.css"]),
			[{ name: "hero", pages: 2, examples: ["/", "/a"] }],
			"https://feature-eds-1--site--org.aem.page/",
		);
		expect(md).toContain("## What to test");
		expect(md).toContain(
			"- `hero`: on 2 pages, e.g. [/](https://feature-eds-1--site--org.aem.page/), [/a](https://feature-eds-1--site--org.aem.page/a)",
		);
		expect(md).toContain(
			"Shared code changed, so every page can be affected:\n- `styles/styles.css`",
		);
	});

	it("says so when nothing on the pages changed", () => {
		expect(scopeMarkdown(classifyFiles(["README.md"]), [], null)).toContain(
			"nothing on the site's pages to retest",
		);
	});
});
