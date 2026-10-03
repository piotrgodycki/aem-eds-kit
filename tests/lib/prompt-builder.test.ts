import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, buildPrompt } from "../../src/lib/figma/prompt-builder.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/sample-eds-project");

describe("buildPrompt", () => {
	it("generates a prompt with fileKey and nodeId", async () => {
		const prompt = await buildPrompt({
			figma: { fileKey: "abc123", nodeId: "42:100" },
			blockName: "hero-banner",
			projectRoot: FIXTURE_ROOT,
			withUeModel: false,
		});

		expect(prompt).toContain("hero-banner");
		expect(prompt).toContain("abc123");
		expect(prompt).toContain("42:100");
		expect(prompt).toContain("get_design_context");
		expect(prompt).toContain("get_variable_defs");
		expect(prompt).toContain(PROMPT_VERSION);
		expect(prompt).toContain("decorate(block)");
	});

	it("includes existing tokens from styles.css", async () => {
		const prompt = await buildPrompt({
			figma: { fileKey: "abc123" },
			blockName: "card",
			projectRoot: FIXTURE_ROOT,
			withUeModel: false,
		});

		expect(prompt).toContain("--color-brand");
		expect(prompt).toContain("--spacing-m");
		expect(prompt).toContain("Existing Project Tokens");
	});

	it("includes UE model section when requested", async () => {
		const prompt = await buildPrompt({
			figma: { fileKey: "abc123", nodeId: "1:2" },
			blockName: "tabs",
			projectRoot: FIXTURE_ROOT,
			withUeModel: true,
		});

		expect(prompt).toContain("Universal Editor Model");
		expect(prompt).toContain("_tabs.json");
	});

	it("handles missing nodeId gracefully", async () => {
		const prompt = await buildPrompt({
			figma: { fileKey: "abc123" },
			blockName: "footer",
			projectRoot: FIXTURE_ROOT,
			withUeModel: false,
		});

		expect(prompt).toContain("no specific node selected");
		expect(prompt).not.toContain("nodeId:");
	});
});
