import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callsIn, functionBody, importsOf, readPhases } from "../../src/lib/phases.js";

const SCRIPTS = `import {
  loadHeader,
  loadFooter,
  loadSection,
  loadSections,
  loadCSS as loadStyles,
} from './aem.js';
import { loadConsentBanner } from './consent.js';

async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateMain(doc.querySelector('main'));
  await loadSection(doc.querySelector('.section'), waitForFirstImage);
  loadConsentBanner();
}

async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));
  await loadSections(doc.querySelector('main'));
  loadStyles(\`\${window.hlx.codeBasePath}/styles/lazy-styles.css\`);
}

function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
}

function decorateMain(main) {
  buildAutoBlocks(main);
}
`;
const DELAYED = `import pageMetaPush from './page-meta.js';
import { loadGTM } from './analytics.js';

function helper() { notAPhase(); }

pageMetaPush().then(loadGTM);
`;

let root = "";
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "eds-phases-"));
	await mkdir(path.join(root, "scripts"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("loading phases", () => {
	it("reads a function's body and the functions it calls", () => {
		const body = functionBody(SCRIPTS, "loadEager") ?? "";
		expect(callsIn(body)).toEqual(["decorateMain", "loadSection", "loadConsentBanner"]);
		expect(importsOf(SCRIPTS)).toMatchObject({
			loadHeader: "aem.js",
			loadStyles: "aem.js",
			loadConsentBanner: "consent.js",
		});
	});

	it("lists each phase with where each step comes from, and flags a third party in eager", async () => {
		await writeFile(path.join(root, "scripts", "scripts.js"), SCRIPTS);
		await writeFile(path.join(root, "scripts", "delayed.js"), DELAYED);
		const phases = await readPhases(root);
		expect(phases?.eager.map((c) => c.name)).toEqual([
			"decorateMain",
			"loadSection",
			"loadConsentBanner",
		]);
		expect(phases?.eager.find((c) => c.name === "loadConsentBanner")).toMatchObject({
			file: "consent.js",
			warn: "A third party here slows LCP: move it to Delayed.",
		});
		expect(phases?.lazy.map((c) => `${c.name} ${c.file}`)).toEqual([
			"loadHeader aem.js",
			"loadFooter aem.js",
			"loadSections aem.js",
			"loadStyles aem.js",
		]);
		// delayed.js's top level runs; a function it only declares doesn't.
		expect(phases?.delayed.map((c) => c.name)).toEqual(["pageMetaPush", "loadGTM"]);
		expect(phases?.delayed.every((c) => !c.warn)).toBe(true);
	});

	it("is null for a project without the three phases", async () => {
		await writeFile(path.join(root, "scripts", "scripts.js"), "export default 1;\n");
		expect(await readPhases(root)).toBeNull();
	});
});
