import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findClientlibDir, readClientlibCss } from "../../src/lib/migrate/clientlib.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function tmp(): Promise<string> {
	const d = await mkdtemp(path.join(tmpdir(), "eds-clib-"));
	dirs.push(d);
	return d;
}

describe("clientlib CSS", () => {
	it("finds a clientlib folder in the component dir", async () => {
		const comp = await tmp();
		await mkdir(path.join(comp, "clientlibs"), { recursive: true });
		expect(await findClientlibDir(comp)).toBe(path.join(comp, "clientlibs"));
	});

	it("honours css.txt order and flags LESS", async () => {
		const clib = await tmp();
		await writeFile(path.join(clib, "css.txt"), "#base=css\nb.css\na.css\n");
		await mkdir(path.join(clib, "css"), { recursive: true });
		await writeFile(path.join(clib, "css", "a.css"), ".a{color:red}");
		await writeFile(path.join(clib, "css", "b.css"), ".b{color:blue}");
		await writeFile(path.join(clib, "css", "vars.less"), "@c: red;");

		const { css, files, preprocessed } = await readClientlibCss(clib);
		// css.txt lists b before a.
		expect(css.indexOf(".b")).toBeLessThan(css.indexOf(".a"));
		expect(files).toEqual(["css/b.css", "css/a.css"]);
		expect(preprocessed).toContain("css/vars.less");
	});

	it("falls back to all .css when there is no css.txt", async () => {
		const clib = await tmp();
		await writeFile(path.join(clib, "style.css"), ".x{}");
		const { css, files } = await readClientlibCss(clib);
		expect(css).toContain(".x{}");
		expect(files).toEqual(["style.css"]);
	});
});
