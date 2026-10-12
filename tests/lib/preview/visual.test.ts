import path from "node:path";
import { describe, expect, it } from "vitest";
import { baselineDir, baselinePath, formatRatio } from "../../../src/lib/preview/visual.js";

describe("visual-regression helpers", () => {
	it("builds the baseline directory and file paths under the block", () => {
		const root = "/proj";
		expect(baselineDir(root, "hero")).toBe(path.join("/proj", "blocks", "hero", "__snapshots__"));
		expect(baselinePath(root, "hero", 1280)).toBe(
			path.join("/proj", "blocks", "hero", "__snapshots__", "hero-1280.png"),
		);
	});

	it("formats a diff ratio as a percentage", () => {
		expect(formatRatio(0)).toBe("0.00%");
		expect(formatRatio(0.0123)).toBe("1.23%");
		expect(formatRatio(1)).toBe("100.00%");
	});
});
