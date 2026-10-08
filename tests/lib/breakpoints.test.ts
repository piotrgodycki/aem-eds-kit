import { describe, expect, it } from "vitest";
import {
	labelFor,
	normalizeBreakpoints,
	parseWidths,
	resolveBreakpoints,
} from "../../src/lib/figma/breakpoints.js";

describe("breakpoint labels", () => {
	it("buckets widths into mobile / tablet / desktop", () => {
		expect(labelFor(390)).toBe("390 mobile");
		expect(labelFor(768)).toBe("768 tablet");
		expect(labelFor(1440)).toBe("1440 desktop");
	});
});

describe("parseWidths", () => {
	it("parses a comma list and marks the source", () => {
		expect(parseWidths("390, 768 ,1440")).toEqual([
			{ width: 390, label: "390 mobile", source: "figma" },
			{ width: 768, label: "768 tablet", source: "figma" },
			{ width: 1440, label: "1440 desktop", source: "figma" },
		]);
	});

	it("drops invalid / non-positive entries and honours the source", () => {
		expect(parseWidths("0,-5,abc,768", "default")).toEqual([
			{ width: 768, label: "768 tablet", source: "default" },
		]);
	});

	it("returns nothing for an empty/undefined flag", () => {
		expect(parseWidths(undefined)).toEqual([]);
		expect(parseWidths("")).toEqual([]);
	});
});

describe("normalizeBreakpoints", () => {
	it("keeps valid entries, relabels, dedupes, and defaults the source", () => {
		expect(
			normalizeBreakpoints([
				{ width: 390, source: "figma" },
				{ width: "768" },
				{ width: 390 },
				{ width: 0 },
				{ nope: true },
			]),
		).toEqual([
			{ width: 390, label: "390 mobile", source: "figma" },
			{ width: 768, label: "768 tablet", source: "default" },
		]);
	});

	it("returns [] for non-arrays", () => {
		expect(normalizeBreakpoints(null)).toEqual([]);
		expect(normalizeBreakpoints({})).toEqual([]);
	});
});

describe("resolveBreakpoints", () => {
	const agentWrote = [
		{ width: 390, source: "figma" },
		{ width: 1440, source: "figma" },
	];

	it("lets the --widths flag win over what the agent wrote", () => {
		expect(resolveBreakpoints("768,1024", agentWrote)).toEqual([
			{ width: 768, label: "768 tablet", source: "figma" },
			{ width: 1024, label: "1024 tablet", source: "figma" },
		]);
	});

	it("keeps the agent's breakpoints when no flag is given", () => {
		expect(resolveBreakpoints(undefined, agentWrote)).toEqual([
			{ width: 390, label: "390 mobile", source: "figma" },
			{ width: 1440, label: "1440 desktop", source: "figma" },
		]);
	});

	it("returns [] when there's neither a flag nor agent breakpoints", () => {
		expect(resolveBreakpoints(undefined, undefined)).toEqual([]);
		expect(resolveBreakpoints("", null)).toEqual([]);
	});
});
