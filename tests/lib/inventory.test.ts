import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectProject } from "../../src/lib/inventory.js";

let root = "";
const put = async (rel: string, text: string) => {
	await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
	await writeFile(path.join(root, rel), text);
};

describe("what a project already has", () => {
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "eds-inventory-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("finds the content source, blocks, third parties, data layer, metadata and events", async () => {
		await put(
			"fstab.yaml",
			"mountpoints:\n  /: https://acme.sharepoint.com/sites/site/Shared%20Documents/site\n",
		);
		await put("component-definition.json", JSON.stringify({ groups: [{ components: [{}, {}] }] }));
		await put("component-models.json", "[{},{},{}]");
		await put(
			"blocks/hero/hero.js",
			`export default function decorate(block) {
  block.addEventListener('click', () => window.dataLayer.push({ event: 'hero_click' }));
  block.dispatchEvent(new CustomEvent('hero:ready'));
}`,
		);
		await put("blocks/hero/hero.css", ".hero{}");
		await put("blocks/hero/_hero.json", "{}");
		await put(
			"head.html",
			`<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script><meta name="template">`,
		);
		await put(
			"scripts/scripts.js",
			"const t = getMetadata('template'); sampleRUM('cwv'); window.adobeDataLayer = [];",
		);
		await put(
			"scripts/delayed.js",
			"loadScript('https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234');",
		);
		await put(
			"styles/styles.css",
			":root { --brand: red; --text: #000; } body { font-family: 'Inter', sans-serif; }",
		);
		await put("node_modules/x/index.js", "window.dataLayer.push({ event: 'ignored' })");

		const inv = await inspectProject(root);
		expect(inv.kind).toBe("universal-editor");
		expect(inv.content?.source).toBe("SharePoint");
		expect(inv.blocks).toEqual([
			{ name: "hero", js: true, css: true, model: true, preview: false },
		]);
		expect(inv.components).toEqual({ definitions: 2, models: 3, filters: 0 });
		expect(inv.thirdParties.map((t) => t.name)).toEqual(["Google Tag Manager", "OneTrust"]);
		expect(inv.analytics.dataLayer.map((d) => d.name)).toEqual([
			"adobeDataLayer (Adobe Client Data Layer)",
			"dataLayer (Google)",
			"dataLayer: hero_click",
		]);
		expect(inv.analytics.events).toEqual([{ name: "hero:ready", files: ["blocks/hero/hero.js"] }]);
		expect(inv.analytics.metadata.map((m) => m.name)).toEqual(["template"]);
		expect(inv.analytics.rum.map((r) => r.name)).toEqual(["cwv"]);
		expect(inv.analytics.ids.map((i) => i.name)).toEqual(["GTM-ABC1234"]);
		expect(inv.styles).toEqual({ tokens: 2, fonts: ["Inter"] });
	});

	it("says what it can't know when the project is bare", async () => {
		const inv = await inspectProject(root);
		expect(inv).toMatchObject({ kind: "document", content: null, blocks: [], thirdParties: [] });
	});
});
