import { describe, expect, it } from "vitest";
import { f, n } from "../../src/lib/model/helpers.js";
import {
	PARTIALS,
	cta,
	heading,
	image,
	partialById,
	teaser,
} from "../../src/lib/model/partials.js";

describe("field helpers", () => {
	it("set the right valueType per component", () => {
		expect(f.text("a")).toMatchObject({ component: "text", valueType: "string" });
		expect(f.number("a")).toMatchObject({ component: "number", valueType: "number" });
		expect(f.boolean("a", "A")).toMatchObject({ valueType: "boolean", value: false });
		expect(f.dateTime("a")).toMatchObject({ valueType: "date" });
		expect(f.aemContent("a")).toEqual({ component: "aem-content", name: "a", label: undefined });
	});

	it("select includes options and an optional default", () => {
		const s = f.select("size", "Size", [{ name: "S", value: "sm" }], "sm");
		expect(s.options).toHaveLength(1);
		expect(s.value).toBe("sm");
		expect(f.select("x", "X", []).value).toBeUndefined();
	});

	it("n() applies a prefix in camelCase", () => {
		expect(n("", "link")).toBe("link");
		expect(n("cta", "link")).toBe("ctaLink");
	});
});

describe("partials", () => {
	it("heading is title + titleType (semantic)", () => {
		expect(heading().map((x) => x.name)).toEqual(["title", "titleType"]);
	});

	it("image is image + imageAlt", () => {
		expect(image().map((x) => x.name)).toEqual(["image", "imageAlt"]);
	});

	it("cta composes link + style", () => {
		const names = cta().map((x) => x.name);
		expect(names).toContain("link");
		expect(names).toContain("ctaStyle");
	});

	it("prefix avoids name clashes", () => {
		expect(cta("secondary").map((x) => x.name)).toContain("secondaryLink");
	});

	it("teaser composes several partials", () => {
		const names = teaser().map((x) => x.name);
		expect(names).toEqual(expect.arrayContaining(["image", "title", "linkText"]));
	});

	it("registry ids are unique and resolvable", () => {
		const ids = PARTIALS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(partialById("teaser")?.build).toBe(teaser);
	});
});
