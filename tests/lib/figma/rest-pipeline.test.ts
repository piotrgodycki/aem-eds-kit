import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDesign } from "../../../src/lib/figma/design-source.js";
import { buildPrompt } from "../../../src/lib/figma/prompt-builder.js";
import { fetchFigmaImage } from "../../../src/lib/figma/rest.js";

// The example file's hero frame (node 12:345) as the Figma REST API returns it.
const NODE = path.resolve("tests/fixtures/figma-rest/hero-node.json");
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const FIGMA = { fileKey: "AbCdEf123", nodeId: "12:345" };

/** A stand-in for api.figma.com: records calls, checks the token. */
function figmaApi() {
	const calls: string[] = [];
	const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push(url);
		const token = (init?.headers as Record<string, string> | undefined)?.["X-Figma-Token"];
		if (url.includes("s3.")) return new Response(PNG);
		if (token !== "figd_test") return new Response('{"err":"Invalid token"}', { status: 403 });
		if (url.includes("/files/AbCdEf123/nodes?ids=12%3A345"))
			return new Response(await readFile(NODE, "utf-8"));
		if (url.includes("/images/AbCdEf123?ids=12%3A345"))
			return Response.json({ err: null, images: { "12:345": "https://s3.example/hero.png" } });
		return new Response('{"err":"Not found"}', { status: 404 });
	});
	return { calls, fetchMock };
}

describe("Figma REST pipeline (stand-in API)", () => {
	let root: string;
	let api: ReturnType<typeof figmaApi>;

	beforeEach(async () => {
		root = await mkdtemp(path.join(tmpdir(), "eds-rest-"));
		api = figmaApi();
		vi.stubGlobal("fetch", api.fetchMock);
	});
	afterEach(async () => {
		vi.unstubAllGlobals();
		await rm(root, { recursive: true, force: true });
	});

	it("fetches the node once, caches it, and reuses the cache", async () => {
		const first = await resolveDesign({ figma: FIGMA, token: "figd_test", projectRoot: root });
		expect(first.summary).toMatch(/^REST → /);
		expect(first.design?.mode).toBe("spec");
		const cache = path.join(root, "tmp", "eds-cli", "design-cache", "AbCdEf123__12-345.json");
		expect(existsSync(cache)).toBe(true);
		const spec = JSON.parse(await readFile(cache, "utf-8"));
		expect(spec.root).toMatchObject({ name: "hero", type: "FRAME", layout: { direction: "row" } });

		const again = await resolveDesign({ figma: FIGMA, token: "figd_test", projectRoot: root });
		expect(again.summary).toMatch(/^cache /);
		expect(api.calls).toHaveLength(1);

		await resolveDesign({ figma: FIGMA, token: "figd_test", projectRoot: root, refresh: true });
		expect(api.calls).toHaveLength(2);
	});

	it("falls back to MCP with the token hint on a 403", async () => {
		const r = await resolveDesign({ figma: FIGMA, token: "figd_bad", projectRoot: root });
		expect(r.design?.mode).toBe("mcp");
		expect(r.restError).toMatch(/403.*file_content:read/);
	});

	it("says the node wasn't found on a 404", async () => {
		const r = await resolveDesign({
			figma: { fileKey: "AbCdEf123", nodeId: "9:9" },
			token: "figd_test",
			projectRoot: root,
		});
		expect(r.restError).toMatch(/404.*not found/);
	});

	it("embeds the REST spec compactly in the prompt, with no MCP step", async () => {
		const r = await resolveDesign({ figma: FIGMA, token: "figd_test", projectRoot: root });
		const prompt = await buildPrompt({
			provider: "figma",
			figma: FIGMA,
			blockName: "hero",
			projectRoot: root,
			design: r.design,
		});
		expect(prompt).toContain("Use the Provided Design Data (no MCP)");
		expect(prompt).not.toContain("get_design_context` exactly once");
		expect(prompt).toContain('"name":"hero","type":"FRAME"');
	});

	it("renders the node to a PNG for the --design diff", async () => {
		const png = await fetchFigmaImage({ ...FIGMA, token: "figd_test" });
		expect(png.subarray(0, 8)).toEqual(PNG);
		expect(api.calls.map((c) => new URL(c).pathname)).toEqual([
			"/v1/images/AbCdEf123",
			"/hero.png",
		]);
	});
});
