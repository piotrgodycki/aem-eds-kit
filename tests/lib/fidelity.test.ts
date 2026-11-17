import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compareToDesign } from "../../src/lib/fidelity.js";

/** A PNG of one colour, with an optional black box in it. */
function png(
	width: number,
	height: number,
	box?: { x: number; y: number; w: number; h: number },
): Buffer {
	const img = new PNG({ width, height });
	img.data.fill(255);
	if (box)
		for (let y = box.y; y < box.y + box.h; y++)
			for (let x = box.x; x < box.x + box.w; x++) {
				const i = (y * width + x) * 4;
				img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
			}
	return PNG.sync.write(img);
}

describe("a block against its design", () => {
	it("is 0% off when they match", async () => {
		const a = png(100, 50, { x: 10, y: 10, w: 20, h: 20 });
		expect((await compareToDesign(a, a)).ratio).toBe(0);
	});

	it("measures against the content, so a mostly empty design can't hide a wrong block", async () => {
		// A box the render lacks is all of the content: 100% off, not 1% of the canvas.
		const r = await compareToDesign(png(100, 100, { x: 0, y: 0, w: 10, h: 10 }), png(100, 100));
		expect(r.diffPixels).toBe(100);
		expect(r.ratio).toBe(1);
		// The same box moved by half its width: the overlap matches, the rest doesn't.
		const moved = await compareToDesign(
			png(100, 100, { x: 10, y: 10, w: 20, h: 20 }),
			png(100, 100, { x: 20, y: 10, w: 20, h: 20 }),
		);
		expect(moved.ratio).toBeCloseTo(400 / 600);
	});

	it("counts a block shorter than the design as different", async () => {
		const design = png(100, 100, { x: 0, y: 50, w: 100, h: 50 });
		const render = png(100, 50);
		const r = await compareToDesign(design, render);
		expect(r.height).toBe(100);
		expect(r.ratio).toBe(1);
		expect(r.render).toEqual({ width: 100, height: 50 });
	});
});
