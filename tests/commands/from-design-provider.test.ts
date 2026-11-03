import { describe, expect, it } from "vitest";
import { detectProvider } from "../../src/commands/block/from-design.js";
import { isScrapeable } from "../../src/lib/figma/design-source.js";

describe("detectProvider", () => {
	it("recognises Figma, Framer and Stitch by host", () => {
		expect(detectProvider("https://www.figma.com/design/KEY/Name?node-id=1-2")).toBe("figma");
		expect(detectProvider("https://my-site.framer.website/")).toBe("framer");
		expect(detectProvider("https://stitch.withgoogle.com/projects/123")).toBe("stitch");
	});

	it("treats any other http(s) page as a web page to scrape", () => {
		expect(detectProvider("https://piotrgodycki.github.io/aem-eds-kit/example/")).toBe("web");
		expect(detectProvider("http://127.0.0.1:4500/example/")).toBe("web");
		expect(isScrapeable("web")).toBe(true);
	});

	it("leaves local paths and non-http links undetected", () => {
		expect(detectProvider("./hero.svg")).toBeUndefined();
		expect(detectProvider("ftp://example.com/hero.png")).toBeUndefined();
		expect(detectProvider(undefined)).toBeUndefined();
	});
});
