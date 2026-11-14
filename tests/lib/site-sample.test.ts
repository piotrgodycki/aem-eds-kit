import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	absoluteMedia,
	blockOn,
	firstMedia,
	PLACEHOLDER_IMAGE,
	useSiteContent,
	withImage,
} from "../../src/lib/site-sample.js";

const BASE = "https://main--eds-kit-demo--example.aem.page/";

/** A home page as EDS serves it at /index.plain.html. */
const HOME = `<div><h1>Welcome</h1></div>
<div><div class="hero"><div><div><picture><source type="image/webp" srcset="./media_1a2b.jpg?width=2000&#x26;format=webply" media="(min-width: 600px)"><img loading="lazy" alt="Team" src="./media_1a2b.jpg?width=750&#x26;format=jpg"></picture></div></div><div><div><h2>Build faster</h2><p>Ship blocks in minutes.</p></div></div></div></div>
<div><div class="cards"><div><div><p>Card</p></div></div></div></div>`;

describe("reading a block from the site", () => {
	it("finds a block with everything inside it", () => {
		const hero = blockOn(HOME, "hero") ?? "";
		expect(hero.startsWith('<div class="hero">')).toBe(true);
		expect(hero).toContain("Build faster");
		expect(hero).not.toContain("cards");
		expect(blockOn(HOME, "hero-banner")).toBeNull();
	});

	it("makes the site's media links absolute", () => {
		const hero = absoluteMedia(blockOn(HOME, "hero") ?? "", BASE);
		expect(hero).toContain(`srcset="${BASE}media_1a2b.jpg?width=2000`);
		expect(hero).toContain(`src="${BASE}media_1a2b.jpg?width=750`);
	});

	it("takes the first of the site's images", () => {
		expect(firstMedia(HOME, BASE)).toBe(`${BASE}media_1a2b.jpg?width=750&#x26;format=jpg`);
		expect(firstMedia("<p>No pictures</p>", BASE)).toBeNull();
	});
});

describe("images in a sample", () => {
	it("replaces a picture that isn't the site's own, and keeps the site's", () => {
		const sample = `<div class="teaser"><div><div><picture><source srcset="https://images.example.com/a.webp"><img src="https://images.example.com/a.jpg" alt="Random"></picture><img src="${BASE}media_9.jpg" alt="Ours"></div></div></div>`;
		const fixed = withImage(sample, PLACEHOLDER_IMAGE);
		expect(fixed).not.toContain("images.example.com");
		expect(fixed).toContain(`src="${PLACEHOLDER_IMAGE}" alt="Random"`);
		expect(fixed).toContain(`src="${BASE}media_9.jpg" alt="Ours"`);
	});
});

describe("useSiteContent", () => {
	let root = "";
	let dir = "";
	const pages: Record<string, string> = {
		[`${BASE}index.plain.html`]: HOME,
		[`${BASE}query-index.json`]: JSON.stringify({ data: [{ path: "/about" }] }),
		[`${BASE}about.plain.html`]: "<div><p>About us</p></div>",
	};
	const get = async (url: string) => pages[url] ?? null;

	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "eds-site-"));
		dir = await mkdtemp(path.join(os.tmpdir(), "eds-site-v-"));
		execFileSync("git", ["init", "-q"], { cwd: root });
		execFileSync(
			"git",
			["remote", "add", "origin", "https://github.com/example/eds-kit-demo.git"],
			{
				cwd: root,
			},
		);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
		await rm(dir, { recursive: true, force: true });
	});

	it("gives a draft with no sample the block's real content from the site", async () => {
		await useSiteContent(root, "hero", dir, get);
		const sample = await readFile(path.join(dir, "_hero.preview.html"), "utf-8");
		expect(sample.startsWith('<div class="hero block">')).toBe(true);
		expect(sample).toContain("Build faster");
		expect(sample).toContain(`src="${BASE}media_1a2b.jpg`);
	});

	it("swaps the agent's pictures for the site's own", async () => {
		const file = path.join(dir, "_teaser.preview.html");
		await writeFile(
			file,
			'<div class="teaser"><div><div><img src="image.jpg" alt=""></div></div></div>',
		);
		await useSiteContent(root, "teaser", dir, get);
		expect(await readFile(file, "utf-8")).toContain(`src="${BASE}media_1a2b.jpg`);
	});

	it("uses a grey box when the site can't be read", async () => {
		const file = path.join(dir, "_teaser.preview.html");
		await writeFile(
			file,
			'<div class="teaser"><div><div><img src="image.jpg" alt=""></div></div></div>',
		);
		await useSiteContent(root, "teaser", dir, async () => null);
		expect(await readFile(file, "utf-8")).toContain(PLACEHOLDER_IMAGE);
	});

	it("leaves a sample with no pictures alone, without reading the site", async () => {
		const file = path.join(dir, "_teaser.preview.html");
		await writeFile(file, '<div class="teaser"><div><div><p>Text</p></div></div></div>');
		let reads = 0;
		await useSiteContent(root, "teaser", dir, async () => {
			reads++;
			return null;
		});
		expect(reads).toBe(0);
		expect(await readFile(file, "utf-8")).toContain("<p>Text</p>");
	});
});
