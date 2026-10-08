import { describe, expect, it } from "vitest";
import { buildEnv } from "../../src/lib/scaffold/env.js";
import { XWALK_CONFIG, buildXwalk } from "../../src/lib/scaffold/xwalk.js";

describe("scaffold env (.env)", () => {
	it("defaults AEM_OPEN=/ , AEM_PORT=3007 , empty AEM_PAGES_URL", () => {
		expect(buildEnv()).toBe("AEM_OPEN=/\nAEM_PORT=3007\nAEM_PAGES_URL=\n");
	});

	it("honours provided values", () => {
		expect(buildEnv({ open: "/blog", port: 4000, pagesUrl: "https://main--s--o.aem.page" })).toBe(
			"AEM_OPEN=/blog\nAEM_PORT=4000\nAEM_PAGES_URL=https://main--s--o.aem.page\n",
		);
	});
});

describe("scaffold xwalk (xwalk.json)", () => {
	it("enables multi-field under public.xwalk", () => {
		expect(XWALK_CONFIG).toEqual({ public: { xwalk: { "multi-field": { enabled: true } } } });
	});

	it("serialises as pretty JSON with a trailing newline", () => {
		const out = buildXwalk();
		expect(out.endsWith("\n")).toBe(true);
		expect(JSON.parse(out)).toEqual(XWALK_CONFIG);
	});
});
