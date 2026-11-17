/**
 * How close a block is to its design: the rendered block against the design's
 * image, pixel by pixel, over the larger of the two (a block taller or shorter
 * than the design counts as different, unlike `compareOverlap`). The goal is a
 * number to work towards, e.g. 3% or less, not a pass/fail test.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import type { Draft } from "./draft.js";
import { designCachePath, urlCachePath } from "./figma/design-source.js";
import { loadOptional } from "./optional-dep.js";

/** Where a draft's design image is: the exported file it came from, or the cached render or scrape. */
export function designImageFor(root: string, draft: Draft): string | null {
	const ref = draft.source.designRef;
	if (ref && /\.(png|jpe?g|svg)$/i.test(ref)) {
		const file = path.resolve(root, ref);
		if (existsSync(file)) return file;
	}
	const figma = draft.source.figma;
	if (figma?.fileKey) {
		const png = designCachePath(root, figma.fileKey, figma.nodeId).replace(/\.json$/, ".png");
		if (existsSync(png)) return png;
	}
	if (ref && /^https?:\/\//.test(ref)) {
		const png = urlCachePath(root, ref).replace(/\.json$/, ".png");
		if (existsSync(png)) return png;
	}
	return null;
}

interface Fidelity {
	/** Share of the content (pixels that aren't background in either image) that differs, 0..1. */
	ratio: number;
	diffPixels: number;
	width: number;
	height: number;
	design: { width: number; height: number };
	render: { width: number; height: number };
	/** The two images over each other, differences in red. */
	diffPng: Buffer;
}

// biome-ignore lint/suspicious/noExplicitAny: optional deps, no types installed
async function imgLibs(): Promise<{ PNG: any; pixelmatch: any }> {
	// biome-ignore lint/suspicious/noExplicitAny: optional deps, no types installed
	const png = await loadOptional<{ PNG: any }>("pngjs");
	// biome-ignore lint/suspicious/noExplicitAny: optional deps, no types installed
	const pm = await loadOptional<{ default: any }>("pixelmatch");
	if (!png || !pm)
		throw new Error(
			"Measuring against the design needs pngjs and pixelmatch: npm i -D pngjs pixelmatch",
		);
	return { PNG: png.PNG, pixelmatch: pm.default };
}

/**
 * The design against the render. Both sit at the top left of a canvas in the
 * design's background colour, the size of the larger one. The share counts the
 * pixels that differ against the pixels that hold content in either image, so a
 * mostly empty design can't make a wrong block look close.
 */
export async function compareToDesign(design: Buffer, render: Buffer): Promise<Fidelity> {
	const { PNG, pixelmatch } = await imgLibs();
	const a = PNG.sync.read(design);
	const b = PNG.sync.read(render);
	const width = Math.max(a.width, b.width);
	const height = Math.max(a.height, b.height);
	const bg = background(a);
	const canvas = (img: { width: number; height: number }) => {
		const c = new PNG({ width, height });
		for (let i = 0; i < c.data.length; i += 4) {
			c.data[i] = bg[0];
			c.data[i + 1] = bg[1];
			c.data[i + 2] = bg[2];
			c.data[i + 3] = 255;
		}
		PNG.bitblt(img, c, 0, 0, img.width, img.height, 0, 0);
		return c;
	};
	const ca = canvas(a);
	const cb = canvas(b);
	const diff = new PNG({ width, height });
	// Anti-aliasing is left out: text and edges render a little differently in every browser.
	const diffPixels = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.1 });
	const isContent = (d: Uint8Array, i: number) =>
		Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24;
	let content = 0;
	for (let i = 0; i < ca.data.length; i += 4)
		if (isContent(ca.data, i) || isContent(cb.data, i)) content++;
	return {
		ratio: content ? Math.min(1, diffPixels / content) : 0,
		diffPixels,
		width,
		height,
		design: { width: a.width, height: a.height },
		render: { width: b.width, height: b.height },
		diffPng: PNG.sync.write(diff),
	};
}

/** The design's background: the colour most of its four corners share (a corner may hold content). */
function background(img: { width: number; height: number; data: Uint8Array }): number[] {
	const at = (x: number, y: number) => {
		const i = (y * img.width + x) * 4;
		return [img.data[i], img.data[i + 1], img.data[i + 2]];
	};
	const corners = [
		at(0, 0),
		at(img.width - 1, 0),
		at(0, img.height - 1),
		at(img.width - 1, img.height - 1),
	];
	const key = (c: number[]) => c.join(",");
	return corners.reduce((best, c) =>
		corners.filter((x) => key(x) === key(c)).length >
		corners.filter((x) => key(x) === key(best)).length
			? c
			: best,
	);
}

/** The design image's width and height, from its PNG header. */
export async function pngSize(png: Buffer): Promise<{ width: number; height: number }> {
	const { PNG } = await imgLibs();
	const img = PNG.sync.read(png);
	return { width: img.width, height: img.height };
}
