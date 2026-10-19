import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
	baselineDir,
	baselinePath,
	compareOverlap,
	comparePng,
	formatRatio,
} from "../../../src/lib/preview/visual.js";

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
	const png = new PNG({ width, height });
	for (let i = 0; i < png.data.length; i += 4) {
		png.data[i] = rgb[0];
		png.data[i + 1] = rgb[1];
		png.data[i + 2] = rgb[2];
		png.data[i + 3] = 255;
	}
	return PNG.sync.write(png);
}

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

	it("diffs the common region of two differently-sized PNGs", async () => {
		const same = await compareOverlap(solidPng(4, 6, [255, 0, 0]), solidPng(8, 3, [255, 0, 0]));
		expect(same).toMatchObject({ width: 4, height: 3, diffPixels: 0, ratio: 0 });
		const diff = await compareOverlap(solidPng(4, 4, [255, 0, 0]), solidPng(2, 2, [0, 0, 255]));
		expect(diff).toMatchObject({ width: 2, height: 2, diffPixels: 4, ratio: 1 });
	});

	it("reports both sizes when two PNGs differ in dimensions", async () => {
		const res = await comparePng(solidPng(4, 900, [0, 0, 0]), solidPng(4, 80, [0, 0, 0]));
		expect(res).toMatchObject({
			sizeMismatch: true,
			width: 4,
			height: 900,
			otherWidth: 4,
			otherHeight: 80,
		});
	});
});
