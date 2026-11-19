import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpec, templateMain, templatePage } from "../../../src/lib/template/spec.js";

function project(): string {
	const root = mkdtempSync(path.join(tmpdir(), "eds-template-"));
	mkdirSync(path.join(root, "blocks", "hero"), { recursive: true });
	writeFileSync(
		path.join(root, "blocks", "hero", "_hero.json"),
		JSON.stringify({
			models: [
				{
					id: "hero",
					fields: [
						{ component: "text", name: "title" },
						{ component: "tab", name: "more" },
						{ component: "text", name: "text" },
					],
				},
			],
		}),
	);
	mkdirSync(path.join(root, "blocks", "cards"), { recursive: true });
	writeFileSync(
		path.join(root, "blocks", "cards", "_cards.preview.html"),
		'<body><div class="cards block"><div><div>Sample card</div></div></div></body>',
	);
	writeFileSync(
		path.join(root, "head.html"),
		'<script src="/scripts/aem.js" type="module"></script>',
	);
	return root;
}

describe("template spec", () => {
	it("rejects names that aren't plain block names", () => {
		expect(() => parseSpec('{"name":"Bad Name","sections":[]}')).toThrow(/lower case/);
		expect(() =>
			parseSpec(
				'{"name":"ok","sections":[{"blocks":[{"name":"hero","variant":["x\\" onload"]}]}]}',
			),
		).toThrow(/plain variants/);
	});

	it("puts a section's style on the section, as EDS delivers it", async () => {
		const main = await templateMain(
			project(),
			parseSpec(
				'{"name":"t","sections":[{"style":["highlight"],"blocks":[{"name":"hero","variant":["dark"],"fields":{"title":"Hi","text":"<b>x</b>"}}]}]}',
			),
		);
		expect(main).toContain('<div class="highlight"><div class="hero dark">');
		expect(main).toContain("<div><div>Hi</div></div><div><div>&lt;b&gt;x&lt;/b&gt;</div></div>");
		expect(main).not.toContain("section-metadata");
	});

	it("uses the block's own sample when no starting content is set", async () => {
		const main = await templateMain(
			project(),
			parseSpec('{"name":"t","sections":[{"blocks":[{"name":"cards","variant":["three"]}]}]}'),
		);
		expect(main).toContain('<div class="cards three"><div><div>Sample card</div></div></div>');
	});

	it("wraps the template in the project's head and an empty header and footer", async () => {
		const page = await templatePage(project(), parseSpec('{"name":"t","title":"T","sections":[]}'));
		expect(page).toContain('<script src="/scripts/aem.js" type="module"></script>');
		expect(page).toMatch(/<header><\/header>[\s\S]*<main>[\s\S]*<footer><\/footer>/);
	});
});
