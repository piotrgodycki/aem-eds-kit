import { describe, expect, it } from "vitest";
import { SCHEMA_TYPES, injectJsonLd, schemaTypeById } from "../../src/lib/schema/jsonld.js";

const BLOCK = `export default function decorate(block) {
  block.classList.add('faq');
}
`;

/** Resolve a type or fail the test (avoids non-null assertions). */
function type(id: string) {
	const t = schemaTypeById(id);
	if (!t) throw new Error(`unknown schema type ${id}`);
	return t;
}

describe("injectJsonLd", () => {
	it("injects a JSON-LD builder into decorate (aliased to root)", () => {
		const { js, changed } = injectJsonLd(BLOCK, type("FAQPage"));
		expect(changed).toBe(true);
		expect(js).toContain("application/ld+json");
		expect(js).toContain("'@type': 'FAQPage'");
		expect(js).toContain("const root = block;");
		expect(js).toContain("document.head.append(ldScript)");
	});

	it("is idempotent", () => {
		const once = injectJsonLd(BLOCK, type("Article"));
		const twice = injectJsonLd(once.js, type("FAQPage"));
		expect(twice.changed).toBe(false);
		expect(twice.reason).toMatch(/already/);
	});

	it("aliases root from the real decorate parameter", () => {
		const custom = "export default function decorate(el) {\n  el.hidden = false;\n}\n";
		const { js } = injectJsonLd(custom, type("Article"));
		expect(js).toContain("const root = el;");
	});

	it("bails when there is no decorate()", () => {
		const { changed, reason } = injectJsonLd("export const x = 1;\n", SCHEMA_TYPES[0]);
		expect(changed).toBe(false);
		expect(reason).toMatch(/decorate/);
	});

	it("resolves types case-insensitively", () => {
		expect(schemaTypeById("faqpage")?.id).toBe("FAQPage");
		expect(schemaTypeById("nope")).toBeUndefined();
	});
});
