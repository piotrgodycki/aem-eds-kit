/**
 * Visual-regression helpers: screenshot a preview route with Playwright and
 * diff two PNGs with pixelmatch. Playwright / pixelmatch / pngjs are optional
 * dependencies (heavy, and only needed for `eds block test`), loaded lazily via
 * a non-literal specifier so the build doesn't require them.
 */

import path from "node:path";

const INSTALL_HINT =
	"Visual testing needs extra tools. Install them with:\n" +
	"  npm i -D playwright pixelmatch pngjs && npx playwright install chromium";

/** Directory holding a block's committed baseline screenshots. */
export function baselineDir(projectRoot: string, blockName: string): string {
	return path.join(projectRoot, "blocks", blockName, "__snapshots__");
}

/** Path of one baseline screenshot (`blocks/<name>/__snapshots__/<name>-<width>.png`). */
export function baselinePath(projectRoot: string, blockName: string, width: number): string {
	return path.join(baselineDir(projectRoot, blockName), `${blockName}-${width}.png`);
}

/** Format a 0..1 diff ratio as a percentage string. */
export function formatRatio(ratio: number): string {
	return `${(ratio * 100).toFixed(2)}%`;
}

/** Screenshot a URL at a given viewport width (full page) with headless Chromium. */
export async function screenshotRoute(
	url: string,
	width: number,
	viewportHeight = 900,
): Promise<Buffer> {
	// biome-ignore lint/suspicious/noExplicitAny: optional dep, no types installed
	let chromium: any;
	try {
		const specifier = "playwright";
		({ chromium } = await import(specifier));
	} catch {
		throw new Error(INSTALL_HINT);
	}
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width, height: viewportHeight } });
		await page.goto(url, { waitUntil: "networkidle" });
		await page.waitForTimeout(300); // let decorate() + fonts settle
		return (await page.screenshot({ fullPage: true })) as Buffer;
	} finally {
		await browser.close();
	}
}

export interface DiffResult {
	diffPixels: number;
	totalPixels: number;
	ratio: number;
	width: number;
	height: number;
	/** True when the two images differ in dimensions (not comparable pixel-wise). */
	sizeMismatch?: boolean;
	/** The rendered diff image (only when dimensions match). */
	diffPng?: Buffer;
}

// biome-ignore lint/suspicious/noExplicitAny: optional deps, no types installed
async function loadImgLibs(): Promise<{ PNG: any; pixelmatch: any }> {
	try {
		const pngSpecifier = "pngjs";
		const pmSpecifier = "pixelmatch";
		const { PNG } = await import(pngSpecifier);
		const pixelmatch = (await import(pmSpecifier)).default;
		return { PNG, pixelmatch };
	} catch {
		throw new Error(INSTALL_HINT);
	}
}

/** Pixel-diff two PNG buffers. Different dimensions → `sizeMismatch` (ratio 1). */
export async function comparePng(a: Buffer, b: Buffer): Promise<DiffResult> {
	const { PNG, pixelmatch } = await loadImgLibs();
	const imgA = PNG.sync.read(a);
	const imgB = PNG.sync.read(b);
	if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
		return {
			diffPixels: -1,
			totalPixels: 0,
			ratio: 1,
			sizeMismatch: true,
			width: imgA.width,
			height: imgA.height,
		};
	}
	const { width, height } = imgA;
	const diff = new PNG({ width, height });
	const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.1 });
	const totalPixels = width * height;
	return {
		diffPixels,
		totalPixels,
		ratio: totalPixels ? diffPixels / totalPixels : 0,
		width,
		height,
		diffPng: PNG.sync.write(diff),
	};
}

/**
 * Diff the common top-left region of two PNGs that may differ in size (crops
 * both to the smaller width × height). Used for the design↔render comparison,
 * where the Figma frame and the rendered block rarely match exactly - so the
 * result is **approximate** (placeholders vs real content, responsive height).
 */
export async function compareOverlap(a: Buffer, b: Buffer): Promise<DiffResult> {
	const { PNG, pixelmatch } = await loadImgLibs();
	const imgA = PNG.sync.read(a);
	const imgB = PNG.sync.read(b);
	const width = Math.min(imgA.width, imgB.width);
	const height = Math.min(imgA.height, imgB.height);

	const cropA = new PNG({ width, height });
	const cropB = new PNG({ width, height });
	imgA.bitblt(cropA, 0, 0, width, height, 0, 0);
	imgB.bitblt(cropB, 0, 0, width, height, 0, 0);

	const diff = new PNG({ width, height });
	const diffPixels = pixelmatch(cropA.data, cropB.data, diff.data, width, height, {
		threshold: 0.1,
	});
	const totalPixels = width * height;
	return {
		diffPixels,
		totalPixels,
		ratio: totalPixels ? diffPixels / totalPixels : 0,
		width,
		height,
		diffPng: PNG.sync.write(diff),
	};
}
