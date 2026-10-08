import { describe, expect, it } from "vitest";
import {
	assessReadiness,
	hasAemConnection,
	metaContent,
	modelIds,
} from "../../src/lib/ue/check.js";
import { editorLink, parseRemote, previewHost } from "../../src/lib/ue/link.js";

describe("ue link helpers", () => {
	it("parses owner/repo from SSH and HTTPS remotes", () => {
		expect(parseRemote("git@github.com:acme/my-site.git")).toEqual({
			owner: "acme",
			repo: "my-site",
		});
		expect(parseRemote("https://github.com/acme/my-site.git")).toEqual({
			owner: "acme",
			repo: "my-site",
		});
		expect(parseRemote("https://github.com/acme/my-site")).toEqual({
			owner: "acme",
			repo: "my-site",
		});
		expect(parseRemote("https://gitlab.com/acme/my-site")).toBeNull();
	});

	it("builds the preview host", () => {
		expect(previewHost("acme", "my-site")).toBe("main--my-site--acme.aem.page");
		expect(previewHost("acme", "my-site", "dev")).toBe("dev--my-site--acme.aem.page");
	});

	it("builds the Universal Editor deep link", () => {
		expect(editorLink({ host: "main--s--acme.aem.page", path: "/products" })).toBe(
			"https://experience.adobe.com/#/aem/editor/canvas/main--s--acme.aem.page/products",
		);
	});

	it("prefixes the org and normalises host/path", () => {
		expect(
			editorLink({ host: "https://main--s--acme.aem.page/", path: "nested", org: "acme-org" }),
		).toBe(
			"https://experience.adobe.com/#/@acme-org/aem/editor/canvas/main--s--acme.aem.page/nested",
		);
	});
});

describe("ue readiness checks", () => {
	it("reads a meta tag content tolerant of attribute order", () => {
		expect(metaContent('<meta name="x" content="y">', "x")).toBe("y");
		expect(metaContent('<meta content="y" name="x">', "x")).toBe("y");
		expect(metaContent("<meta name=\"x\" content=''>", "x")).toBe("");
		expect(metaContent('<meta name="x">', "z")).toBeNull();
	});

	it("detects the aemconnection meta", () => {
		expect(
			hasAemConnection(
				'<meta name="urn:adobe:aue:system:aemconnection" content="aem:https://localhost:4502">',
			),
		).toBe(true);
		expect(hasAemConnection('<meta name="viewport" content="x">')).toBe(false);
	});

	it("extracts model ids from component-models.json", () => {
		expect(modelIds([{ id: "hero" }, { id: "cards" }, {}, "bad"])).toEqual(["hero", "cards"]);
		expect(modelIds(null)).toEqual([]);
	});

	it("assesses project + per-block editability", () => {
		const r = assessReadiness({
			configPresent: { "component-definition.json": true, "component-models.json": true },
			blocks: [
				{ name: "hero", hasModelFile: true },
				{ name: "cards", hasModelFile: false },
				{ name: "teaser", hasModelFile: false },
			],
			modelIds: ["cards"],
		});
		expect(r.isUeProject).toBe(true);
		expect(r.blocks.find((b) => b.name === "hero")?.editable).toBe(true);
		expect(r.blocks.find((b) => b.name === "cards")?.editable).toBe(true);
		expect(r.blocks.find((b) => b.name === "teaser")?.editable).toBe(false);
	});

	it("flags a non-UE project when config is missing", () => {
		const r = assessReadiness({
			configPresent: { "component-definition.json": true },
			blocks: [],
			modelIds: [],
		});
		expect(r.isUeProject).toBe(false);
	});
});
