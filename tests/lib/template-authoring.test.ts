import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectAuthoring } from "../../src/lib/template/authoring.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function projectWithFstab(mountpoint?: string): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "eds-auth-"));
	dirs.push(dir);
	if (mountpoint)
		await writeFile(path.join(dir, "fstab.yaml"), `mountpoints:\n  /: ${mountpoint}\n`);
	return dir;
}

describe("detectAuthoring", () => {
	it("detects DA with org + site from the mountpoint", async () => {
		const root = await projectWithFstab("https://content.da.live/my-org/my-site/");
		const d = await detectAuthoring(root);
		expect(d.model).toBe("da");
		expect(d.org).toBe("my-org");
		expect(d.site).toBe("my-site");
	});

	it("detects Google Drive and SharePoint mountpoints", async () => {
		expect(
			(await detectAuthoring(await projectWithFstab("https://drive.google.com/drive/folders/x")))
				.model,
		).toBe("gdrive");
		expect(
			(await detectAuthoring(await projectWithFstab("https://acme.sharepoint.com/sites/x"))).model,
		).toBe("sharepoint");
	});

	it("falls back to Universal Editor when there is no fstab", async () => {
		const root = await projectWithFstab();
		expect((await detectAuthoring(root)).model).toBe("ue");
	});
});
