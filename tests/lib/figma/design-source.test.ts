import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesign } from "../../../src/lib/figma/design-source.js";
import { serializeDesign } from "../../../src/lib/figma/rest.js";

const ROOT = tmpdir(); // no files are read for the branches tested here

describe("resolveDesign — adapter selection", () => {
	it("uses the file adapter for a local export", async () => {
		const r = await resolveDesign({ figma: null, localFile: "svg/hero.svg", projectRoot: ROOT });
		expect(r.design).toEqual({ mode: "file", filePath: "svg/hero.svg" });
	});

	it("falls back to the MCP adapter for a Figma file with no token", async () => {
		const r = await resolveDesign({
			figma: { fileKey: "abc", nodeId: "1:2" },
			projectRoot: ROOT,
		});
		expect(r.design?.mode).toBe("mcp");
		if (r.design?.mode === "mcp") expect(r.design.cachePath).toContain("abc");
	});

	it("forces MCP even when a token is present (--mcp)", async () => {
		const r = await resolveDesign({
			figma: { fileKey: "abc", nodeId: "1:2" },
			token: "figd_fake",
			preferMcp: true,
			projectRoot: ROOT,
		});
		expect(r.design?.mode).toBe("mcp");
	});

	it("returns no design descriptor for a non-Figma provider", async () => {
		const r = await resolveDesign({ figma: null, projectRoot: ROOT });
		expect(r.design).toBeUndefined();
		expect(r.summary).toBe("provider MCP");
	});
});

describe("serializeDesign — Figma node JSON → compact spec", () => {
	const raw = {
		name: "Kiri Bloom Kit",
		nodes: {
			"1:2": {
				document: {
					id: "1:2",
					name: "Hero",
					type: "FRAME",
					layoutMode: "HORIZONTAL",
					itemSpacing: 24,
					paddingTop: 40,
					paddingLeft: 32,
					absoluteBoundingBox: { width: 1280, height: 420 },
					fills: [{ type: "SOLID", color: { r: 1, g: 0.35, b: 0.21 } }],
					cornerRadius: 12,
					children: [
						{
							type: "TEXT",
							name: "Headline",
							characters: "Transforming Ideas",
							style: { fontFamily: "Inter", fontSize: 48, fontWeight: 700 },
						},
						{ type: "VECTOR", name: "decor", strokes: [] },
					],
				},
			},
		},
	};

	it("extracts layout, fills, radius, text and typography; drops vector noise", () => {
		const spec = JSON.parse(serializeDesign(raw, "1-2"));
		expect(spec.source).toBe("figma-rest");
		expect(spec.root.name).toBe("Hero");
		expect(spec.root.layout.direction).toBe("row");
		expect(spec.root.layout.gap).toBe(24);
		expect(spec.root.fill).toBe("#ff5936");
		expect(spec.root.radius).toBe(12);
		const text = spec.root.children.find((c: { type: string }) => c.type === "TEXT");
		expect(text.text).toBe("Transforming Ideas");
		expect(text.font.family).toBe("Inter");
		expect(text.font.size).toBe(48);
	});

	it("throws a clear error when there's no document node", () => {
		expect(() => serializeDesign({}, "1-2")).toThrow(/no document node/i);
	});
});
