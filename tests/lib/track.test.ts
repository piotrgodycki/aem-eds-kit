import { describe, expect, it } from "vitest";
import { instrumentJs } from "../../src/lib/track.js";

const BLOCK = `export default function decorate(block) {
  block.classList.add('hero');
}
`;

describe("instrumentJs", () => {
	it("adds the import and click + submit tracking", () => {
		const { js, changed } = instrumentJs(BLOCK, "hero", { click: true, submit: true });
		expect(changed).toBe(true);
		expect(js).toContain("import { trackEvent } from '../../scripts/analytics.js'");
		expect(js).toContain("event: 'block_click', block: 'hero'");
		expect(js).toContain("event: 'form_submit', block: 'hero'");
		// Injected inside decorate (before the original body line).
		expect(js.indexOf("block_click")).toBeLessThan(js.indexOf("classList.add"));
	});

	it("is idempotent", () => {
		const once = instrumentJs(BLOCK, "hero", { click: true, submit: true });
		const twice = instrumentJs(once.js, "hero", { click: true, submit: true });
		expect(twice.changed).toBe(false);
		expect(twice.reason).toMatch(/already/);
	});

	it("respects event selection", () => {
		const { js } = instrumentJs(BLOCK, "hero", { click: true, submit: false });
		expect(js).toContain("block_click");
		expect(js).not.toContain("form_submit");
	});

	it("uses the real decorate parameter name", () => {
		const custom = "export default function decorate(el) {\n  el.textContent = 'x';\n}\n";
		const { js } = instrumentJs(custom, "hero", { click: true, submit: false });
		expect(js).toContain("el.addEventListener('click'");
	});

	it("bails when there is no decorate()", () => {
		const { changed, reason } = instrumentJs("export const x = 1;\n", "hero", {
			click: true,
			submit: true,
		});
		expect(changed).toBe(false);
		expect(reason).toMatch(/decorate/);
	});
});
