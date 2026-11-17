import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent, parseEvents } from "../../src/lib/custom-events.js";
import { objectBody, q, shapeProblem } from "../../src/lib/event-shape.js";
import { pageMetaJs, parsePageMeta } from "../../src/lib/page-meta.js";
import { choiceEvents, instrumentJs, savedChoice } from "../../src/lib/track.js";

/** Whether the code parses as an ES module. */
function parses(js: string): boolean {
	const file = path.join(mkdtempSync(path.join(tmpdir(), "eds-ev-")), "x.mjs");
	writeFileSync(file, js);
	execFileSync(process.execPath, ["--check", file]);
	return true;
}

const BLOCK = "export default function decorate(block) {\n  block.textContent = '';\n}\n";
const PROMO = {
	fields: [
		{ name: "promo.id", from: "attr", key: "data-promo-id" },
		{ name: "promo.name", from: "text", key: ".title" },
		{ name: "promo.position", from: "builtin", key: "position" },
		{ name: "link.url", from: "builtin", key: "href" },
		{ name: "page.type", from: "page", key: "page.type" },
		{ name: "brand", from: "fixed", value: "it's ours" },
	],
};

describe("an event's shape", () => {
	it("nests dotted names in the order first named", () => {
		expect(
			objectBody(
				[
					["a.b", "1"],
					["c", "2"],
					["a.d", "3"],
				],
				"",
			),
		).toEqual(["a: {", "  b: 1,", "  d: 3,", "},", "c: 2,"]);
	});

	it("refuses a name twice, a value that is also a group, and event", () => {
		expect(shapeProblem(["a", "a"])).toContain("twice");
		expect(shapeProblem(["page", "page.path"])).toContain("also holds");
		expect(shapeProblem(["event"])).toContain("event's own name");
		expect(shapeProblem(["page.path", "site.section"])).toBeNull();
	});

	it("quotes any text as a safe single-quoted literal", () => {
		expect(q("it's\n\\")).toBe("'it\\'s\\n\\\\'");
	});
});

describe("the project's events", () => {
	it("checks each field's source", () => {
		expect(() => parseEvent("promo_click", PROMO)).not.toThrow();
		expect(() =>
			parseEvent("x", { fields: [{ name: "a", from: "builtin", key: "cookie" }] }),
		).toThrow("one of block, label, href, position");
		expect(() => parseEvent("bad name", { fields: [] })).toThrow("isn't an event name");
		expect(() => parseEvents([])).toThrow("is an object");
	});

	it("pushes a custom event's fields from where it happened, and parses", () => {
		const defs = parseEvents({ promo_click: PROMO });
		const r = instrumentJs(BLOCK, "hero", {
			click: "block_click",
			submit: null,
			view: "promo_click",
			on: [{ selector: ".cta", event: "promo_click" }],
			defs,
		});
		expect(r.changed).toBe(true);
		// The general click leaves .cta to its own event.
		expect(r.js).toContain("if (!el || el.closest('.cta')) return;");
		expect(r.js).toContain("const el = e.target.closest('.cta');");
		expect(r.js).toContain("getAttribute('data-promo-id')");
		expect(r.js).toContain("window.edsPageMeta?.page?.type ?? ''");
		expect(r.js).toContain("brand: 'it\\'s ours',");
		// The view reads the block itself.
		expect(r.js).toContain("(block.closest('[data-promo-id]')");
		expect(parses(r.js)).toBe(true);
	});

	it("keeps the choice in the code, so a changed event can be written again", () => {
		const first = instrumentJs(BLOCK, "hero", {
			click: "promo_click",
			submit: null,
			defs: {},
		});
		const choice = savedChoice(first.js);
		expect(choice).toEqual({ click: "promo_click", submit: null, view: null });
		expect(choiceEvents(choice ?? { click: null, submit: null })).toEqual(["promo_click"]);
		const again = instrumentJs(first.js, "hero", {
			...(choice ?? { click: null, submit: null }),
			defs: parseEvents({ promo_click: PROMO }),
		});
		expect(again.js).toContain("promo: {");
		expect(again.js.match(/\/\/ --- analytics \(eds track\) ---/g)).toHaveLength(1);
	});

	it("refuses a selector that isn't one line", () => {
		const r = instrumentJs(BLOCK, "hero", {
			click: null,
			submit: null,
			on: [{ selector: ".a\n.b", event: "x" }],
		});
		expect(r.changed).toBe(false);
	});
});

describe("the page event's own shape", () => {
	it("pushes only the team's fields, nested, under the team's name", () => {
		const c = parsePageMeta({
			event: "page_view",
			base: false,
			properties: [
				{ name: "page.path", from: "builtin", key: "path" },
				{ name: "site.section", from: "url", index: 1 },
				{ name: "site.environment", from: "builtin", key: "environment" },
				{ name: "campaign", from: "query", key: "utm_campaign" },
			],
		});
		const js = pageMetaJs(c);
		expect(js).toContain("event: 'page_view',");
		expect(js).toMatch(/site: \{\n\s+section: urlPart\(1\),\n\s+environment: environment\(\),/);
		expect(js).not.toContain("referrer");
		expect(js).toContain("window.edsPageMeta = pageMeta;");
		expect(parses(js.replace(/^import .*$/gm, ""))).toBe(true);
	});

	it("keeps the base fields under page for a config written before", () => {
		const js = pageMetaJs(
			parsePageMeta({ properties: [{ name: "brand", from: "fixed", value: "acme" }] }),
		);
		expect(js).toContain("event: 'page_meta',");
		expect(js).toMatch(/page: \{\n\s+path: window\.location\.pathname,[\s\S]*brand: 'acme',/);
		expect(() =>
			parsePageMeta({ properties: [{ name: "path", from: "fixed", value: "x" }] }),
		).toThrow("twice");
	});
});
