import { describe, it, expect } from "vitest";
import { parseFigmaUrl, normalizeNodeId, nodeIdToUrlFormat } from "../../src/lib/figma/node-id.js";

describe("parseFigmaUrl", () => {
	it("parses a standard design URL with node-id using dashes", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/design/abc123/My-Project?node-id=42-100",
		);
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBe("42:100");
		expect(result.fileName).toBe("My-Project");
	});

	it("parses a design URL with encoded node-id (colon as %3A)", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/design/abc123/My-Project?node-id=42%3A100",
		);
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBe("42:100");
	});

	it("parses a design URL without node-id", () => {
		const result = parseFigmaUrl("https://www.figma.com/design/abc123/My-Project");
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBeUndefined();
		expect(result.fileName).toBe("My-Project");
	});

	it("parses a branch URL using branchKey as fileKey", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/design/abc123/branch/branchXYZ/My-Project?node-id=1-2",
		);
		expect(result.fileKey).toBe("branchXYZ");
		expect(result.nodeId).toBe("1:2");
		expect(result.fileName).toBe("My-Project");
	});

	it("parses a /file/ URL (legacy format)", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/file/abc123/My-File?node-id=10-20",
		);
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBe("10:20");
	});

	it("parses a /board/ URL (FigJam)", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/board/abc123/My-Board?node-id=5-10",
		);
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBe("5:10");
	});

	it("parses a /make/ URL", () => {
		const result = parseFigmaUrl("https://www.figma.com/make/makeKey123/Make-File");
		expect(result.fileKey).toBe("makeKey123");
		expect(result.nodeId).toBeUndefined();
		expect(result.fileName).toBe("Make-File");
	});

	it("parses a /slides/ URL", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/slides/abc123/Slides?node-id=0-1",
		);
		expect(result.fileKey).toBe("abc123");
		expect(result.nodeId).toBe("0:1");
	});

	it("throws on a bare node-id without URL", () => {
		expect(() => parseFigmaUrl("42-100")).toThrow("looks like a node-id");
	});

	it("throws on a non-Figma URL", () => {
		expect(() => parseFigmaUrl("https://example.com/design/abc")).toThrow("Not a Figma URL");
	});

	it("throws on an invalid URL", () => {
		expect(() => parseFigmaUrl("not a url at all")).toThrow("Invalid Figma URL");
	});

	it("throws on a Figma URL with no path segments", () => {
		expect(() => parseFigmaUrl("https://www.figma.com/")).toThrow("Cannot extract fileKey");
	});

	it("handles node-id with multiple dashes", () => {
		const result = parseFigmaUrl(
			"https://www.figma.com/design/abc123/File?node-id=123-456-789",
		);
		expect(result.nodeId).toBe("123:456:789");
	});
});

describe("normalizeNodeId", () => {
	it("converts dashes to colons", () => {
		expect(normalizeNodeId("42-100")).toBe("42:100");
	});

	it("decodes URL-encoded colons", () => {
		expect(normalizeNodeId("42%3A100")).toBe("42:100");
	});

	it("passes through already-normalized IDs", () => {
		expect(normalizeNodeId("42:100")).toBe("42:100");
	});
});

describe("nodeIdToUrlFormat", () => {
	it("converts colons to dashes", () => {
		expect(nodeIdToUrlFormat("42:100")).toBe("42-100");
	});
});
