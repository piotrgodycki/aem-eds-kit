import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authoringFromUrl, detectAuthoring } from "../../src/lib/scaffold/fstab.js";

describe("authoringFromUrl", () => {
	it("maps each content source to its model", () => {
		expect(authoringFromUrl("https://content.da.live/acme/site/")).toBe("da");
		expect(authoringFromUrl("https://drive.google.com/drive/folders/abc")).toBe("gdrive");
		expect(authoringFromUrl("https://acme.sharepoint.com/sites/web/Shared%20Documents/site")).toBe(
			"sharepoint",
		);
		expect(
			authoringFromUrl(
				"https://author-p130360-e1272151.adobeaemcloud.com/bin/franklin.delivery/adobe-rnd/aem-boilerplate-xwalk/main",
			),
		).toBe("ue");
		expect(authoringFromUrl("https://example.com/content")).toBeUndefined();
	});
});

describe("detectAuthoring", () => {
	let root: string;
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "eds-detect-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("reads the fstab mountpoint, single-line or nested", async () => {
		await writeFile(
			path.join(root, "fstab.yaml"),
			"mountpoints:\n  /: https://content.da.live/a/b/\n",
		);
		expect(await detectAuthoring(root)).toBe("da");
		await writeFile(
			path.join(root, "fstab.yaml"),
			'mountpoints:\n  /:\n    url: "https://author-p1-e2.adobeaemcloud.com/bin/franklin.delivery/a/b/main"\n',
		);
		expect(await detectAuthoring(root)).toBe("ue");
	});

	it("falls back to a crosswalk paths.json, else undefined", async () => {
		expect(await detectAuthoring(root)).toBeUndefined();
		await writeFile(path.join(root, "paths.json"), "{}\n");
		expect(await detectAuthoring(root)).toBe("ue");
	});
});
