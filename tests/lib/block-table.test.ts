import { describe, expect, it } from "vitest";
import { blockTable, childDivs } from "../../src/lib/block-table.js";

describe("a block's sample content as a table", () => {
	it("keeps nested divs whole when it splits rows and cells", () => {
		expect(childDivs("<div>a<div>b</div></div><div>c</div>")).toEqual(["a<div>b</div>", "c"]);
	});

	it("puts the name (with variants) on top, one row per row, one cell per cell", () => {
		const t = blockTable(
			'<div class="hero dark block"><div><div><picture><img src="./media/hero.jpg" alt=""></picture><h1>Welcome</h1></div></div><div><div>Left</div><div>Right</div></div></div>',
			"https://draft-hero--demo--acme.aem.page/",
		);
		expect(t?.html).toBe(
			[
				"<table>",
				'<tr><td colspan="2">Hero (dark)</td></tr>',
				'<tr><td colspan="2"><picture><img src="https://draft-hero--demo--acme.aem.page/media/hero.jpg" alt=""></picture><h1>Welcome</h1></td></tr>',
				"<tr><td>Left</td><td>Right</td></tr>",
				"</table>",
			].join("\n"),
		);
		expect(t?.text).toBe("Hero (dark)\nWelcome\nLeft\tRight");
	});

	it("leaves absolute URLs alone and finds no table without a block", () => {
		const t = blockTable(
			'<div class="cards"><div><div><a href="https://example.com/x">x</a></div></div></div>',
			"https://b--r--o.aem.page/",
		);
		expect(t?.html).toContain('href="https://example.com/x"');
		expect(blockTable("<p>no block</p>")).toBeNull();
		// An escaped "&lt;" in the content stays text in the plain-text copy.
		expect(blockTable('<div class="cards"><div><div>a &amp;lt; b</div></div></div>')?.text).toBe(
			"Cards\na &lt; b",
		);
	});
});
