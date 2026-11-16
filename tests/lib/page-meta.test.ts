import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CUSTOM_HEADER,
	functionFrom,
	functionSpan,
	isStub,
	pageMetaJs,
	pageProblems,
	parsePageMeta,
	replaceFunction,
	withStubs,
} from "../../src/lib/page-meta.js";

const CONFIG = parsePageMeta({
	properties: [
		{
			name: "pageType",
			from: "meta",
			key: "page-type",
			required: true,
			allowed: ["home", "detail"],
		},
		{ name: "category", from: "url", index: 1 },
		{ name: "campaign", from: "query", key: "utm_campaign" },
		{ name: "brand", from: "fixed", value: 'acme\'s "best"' },
		{
			name: "loggedIn",
			from: "function",
			key: "isLoggedIn",
			describe: "Whether the visitor is signed in",
		},
	],
});

let dir = "";
beforeAll(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), "eds-page-meta-"));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** Node parses the file as a module (imports aren't resolved): no syntax error reaches a site. */
async function parses(name: string, js: string) {
	const file = path.join(dir, name);
	await writeFile(file, js);
	execFileSync(process.execPath, ["--check", file]);
}

describe("pageMeta in .edsrc.json", () => {
	it("refuses what can't be written safely", () => {
		for (const bad of [
			{ properties: [{ name: "page type", from: "fixed", value: "x" }] },
			{ properties: [{ name: "x", from: "meta" }] },
			{ properties: [{ name: "x", from: "function", key: "do it()" }] },
			{ properties: [{ name: "x", from: "url" }] },
			{
				properties: [
					{ name: "x", from: "fixed", value: "a" },
					{ name: "x", from: "fixed", value: "b" },
				],
			},
		])
			expect(() => parsePageMeta(bad)).toThrow(/pageMeta/);
		expect(parsePageMeta(undefined).properties).toEqual([]);
	});
});

describe("scripts/page-meta.js", () => {
	it("pushes the base fields, then the team's properties, each read its own way", async () => {
		const js = pageMetaJs(CONFIG);
		expect(js).toContain("event: 'page_meta'");
		expect(js).toContain("template: meta('template'),");
		expect(js).toContain('pageType: meta("page-type"),');
		expect(js).toContain("category: urlPart(1),");
		expect(js).toContain('campaign: query("utm_campaign"),');
		expect(js).toContain(`brand: "acme's \\"best\\"",`);
		expect(js).toContain('loggedIn: await run("isLoggedIn", custom.isLoggedIn),');
		expect(js).toContain("import * as custom from './page-meta-custom.js';");
		await parses("page-meta.mjs", js);
	});

	it("leaves out the custom import and the timer when there are no functions", async () => {
		const js = pageMetaJs(parsePageMeta({}));
		expect(js).not.toContain("page-meta-custom.js");
		expect(js).not.toContain("async function run");
		await parses("page-meta-plain.mjs", js);
	});
});

describe("scripts/page-meta-custom.js", () => {
	it("gets a stub for each new function, and keeps what is already there", async () => {
		const first = withStubs("", CONFIG);
		expect(first.startsWith(CUSTOM_HEADER)).toBe(true);
		expect(first).toContain(
			"/** Whether the visitor is signed in */\nexport function isLoggedIn() {",
		);
		const edited = first.replace(
			"return undefined;",
			"return document.cookie.includes('session=');",
		);
		expect(withStubs(edited, CONFIG)).toBe(edited);
		await parses("custom.mjs", first);
	});

	it("puts the agent's function in place of the stub", async () => {
		const reply =
			"```js\n/** Whether the visitor is signed in */\nexport function isLoggedIn() {\n  return /(^|; )session=/.test(document.cookie);\n}\n```";
		const code = functionFrom(reply, "isLoggedIn");
		expect(code).toContain("return /(^|; )session=/.test(document.cookie);");
		const js = replaceFunction(withStubs("", CONFIG), "isLoggedIn", code ?? "");
		expect(js.match(/export function isLoggedIn/g)).toHaveLength(1);
		expect(js).not.toContain("return undefined;");
		await parses("custom-written.mjs", js);
		expect(functionFrom("Sure! Here is a function.", "isLoggedIn")).toBeNull();
	});

	it("tells a stub from a written function", () => {
		const js = withStubs("", CONFIG);
		expect(isStub(js, "isLoggedIn")).toBe(true);
		expect(
			isStub(
				replaceFunction(js, "isLoggedIn", "export function isLoggedIn() {\n  return 1;\n}"),
				"isLoggedIn",
			),
		).toBe(false);
		expect(isStub(js, "notThere")).toBe(true);
	});

	it("finds a function with nested braces", () => {
		const js =
			"export function a() {\n  if (x) { return { b: 1 }; }\n  return 2;\n}\nexport function c() {}\n";
		const span = functionSpan(js, "a");
		expect(js.slice(span?.start, span?.end).endsWith("return 2;\n}")).toBe(true);
	});
});

describe("a page against the rules", () => {
	it("names a missing required field and a value that isn't allowed", () => {
		expect(pageProblems('<meta name="page-type" content="detail">', CONFIG)).toEqual([]);
		expect(pageProblems('<meta name="title" content="x">', CONFIG)).toEqual(["page-type missing"]);
		expect(pageProblems('<meta name="page-type" content="about">', CONFIG)).toEqual([
			'page-type "about" isn\'t allowed (home, detail)',
		]);
	});
});
