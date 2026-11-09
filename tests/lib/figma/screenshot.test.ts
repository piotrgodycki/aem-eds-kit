import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	designCachePath,
	resolveDesign,
	screenshotPathFor,
} from "../../../src/lib/figma/design-source.js";
import { buildPrompt } from "../../../src/lib/figma/prompt-builder.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("screenshot check without an MCP call", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("saves Figma's REST render next to the cached snapshot", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "eds-shot-"));
		const cp = designCachePath(root, "abc", "1:2");
		mkdirSync(path.dirname(cp), { recursive: true });
		writeFileSync(cp, '{"name":"Hero"}');
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("/images/")
				? new Response(JSON.stringify({ images: { "1:2": "https://cdn.example/hero.png" } }))
				: new Response(PNG),
		);
		vi.stubGlobal("fetch", fetchMock);
		const r = await resolveDesign({
			figma: { fileKey: "abc", nodeId: "1:2" },
			token: "figd_fake",
			projectRoot: root,
			screenshot: true,
			restPerMinute: 1000,
		});
		expect(r.design?.mode).toBe("spec");
		const rel = r.design?.mode === "spec" ? r.design.screenshotPath : undefined;
		expect(rel).toBe(path.relative(root, screenshotPathFor(cp)));
		expect(existsSync(path.join(root, rel ?? ""))).toBe(true);
		expect(r.summary).toContain("screenshot");
	});

	it("skips the screenshot without a token (MCP mode asks for one instead)", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "eds-shot-"));
		const r = await resolveDesign({
			figma: { fileKey: "abc", nodeId: "1:2" },
			projectRoot: root,
			screenshot: true,
		});
		expect(r.design?.mode).toBe("mcp");
	});

	it("tells the agent to compare against the saved screenshot", async () => {
		const prompt = await buildPrompt({
			figma: { fileKey: "abc", nodeId: "1:2" },
			blockName: "hero",
			projectRoot: tmpdir(),
			withUeModel: false,
			design: {
				mode: "spec",
				spec: "{}",
				screenshotPath: "tmp/eds-cli/design-cache/abc__1-2.png",
			},
		});
		expect(prompt).toContain(
			"the design screenshot `tmp/eds-cli/design-cache/abc__1-2.png` (open it with your **Read** tool)",
		);
		expect(prompt).not.toContain("You may call `get_screenshot`");
	});
});
