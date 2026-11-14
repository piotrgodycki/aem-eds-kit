import { describe, expect, it } from "vitest";
import { instrumentJs } from "../../src/lib/track.js";

const BLOCK = `export default function decorate(block) {
  block.classList.add('hero');
}
`;
const CLICK_SUBMIT = { click: "block_click", submit: "form_submit" };

describe("instrumentJs", () => {
	it("adds the import and click + submit tracking", () => {
		const { js, changed } = instrumentJs(BLOCK, "hero", CLICK_SUBMIT);
		expect(changed).toBe(true);
		expect(js).toContain("import { trackEvent } from '../../scripts/analytics.js'");
		expect(js).toContain("event: 'block_click', block: 'hero'");
		expect(js).toContain("event: 'form_submit', block: 'hero'");
		// Injected inside decorate (before the original body line).
		expect(js.indexOf("block_click")).toBeLessThan(js.indexOf("classList.add"));
	});

	it("replaces its earlier tracking when run again, so a new choice wins", () => {
		const once = instrumentJs(BLOCK, "hero", CLICK_SUBMIT);
		const again = instrumentJs(once.js, "hero", {
			click: "hero_cta",
			submit: null,
			view: "hero_seen",
		});
		expect(again.changed).toBe(true);
		expect(again.js).toContain("event: 'hero_cta'");
		expect(again.js).toContain("event: 'hero_seen'");
		expect(again.js).not.toContain("block_click");
		expect(again.js).not.toContain("form_submit");
		expect(again.js.match(/analytics \(eds track\)/g)).toHaveLength(2);
		// The same choice twice changes nothing.
		expect(
			instrumentJs(again.js, "hero", { click: "hero_cta", submit: null, view: "hero_seen" })
				.changed,
		).toBe(false);
	});

	it("pushes to the data layers named, and as DOM events, without analytics.js", () => {
		const { js } = instrumentJs(BLOCK, "hero", {
			click: "hero_click",
			submit: null,
			layers: ["dataLayer", "adobeDataLayer"],
			dispatch: true,
		});
		expect(js).not.toContain("scripts/analytics.js");
		expect(js).toContain("['dataLayer','adobeDataLayer'].forEach((name) => {");
		expect(js).toContain(
			"block.dispatchEvent(new CustomEvent(data.event, { bubbles: true, detail: data }));",
		);
	});

	it("tracks the block coming into view once", () => {
		const { js } = instrumentJs(BLOCK, "hero", { click: null, submit: null, view: "block_view" });
		expect(js).toContain("new IntersectionObserver(");
		expect(js).toContain("observer.disconnect();");
		expect(js).not.toContain("addEventListener('click'");
	});

	it("uses the real decorate parameter name", () => {
		const custom = "export default function decorate(el) {\n  el.textContent = 'x';\n}\n";
		const { js } = instrumentJs(custom, "hero", { click: "block_click", submit: null });
		expect(js).toContain("el.addEventListener('click'");
	});

	it("refuses bad event names, nothing selected, and a block without decorate()", () => {
		expect(instrumentJs(BLOCK, "hero", { click: "x'); alert(1", submit: null }).reason).toMatch(
			/isn't an event name/,
		);
		expect(instrumentJs(BLOCK, "hero", { click: null, submit: null }).reason).toMatch(/no events/);
		expect(instrumentJs("export const x = 1;\n", "hero", CLICK_SUBMIT).reason).toMatch(/decorate/);
	});
});
