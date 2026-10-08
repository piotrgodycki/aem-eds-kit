import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Point the command at a throwaway project root per test, and stub the agent
// layer so no real agent runs. `invokeAgent` plays the agent: it writes the
// block files (so verification passes) plus whatever `.eds-meta.json` the test
// wants the "agent" to have produced from the design.
const h = vi.hoisted(() => ({ root: "" }));

vi.mock("../../src/lib/project.js", () => ({ findProjectRoot: () => h.root }));
vi.mock("../../src/lib/agents/detect.js", () => ({
	detectAgent: async () => ({ type: "claude", path: "/usr/bin/claude", hasFigmaMcp: true }),
	detectAllAgents: async () => [],
}));
vi.mock("../../src/lib/agents/invoke.js", async (importActual) => {
	const actual = await importActual<typeof import("../../src/lib/agents/invoke.js")>();
	return { ...actual, invokeAgent: vi.fn() };
});

import { blockFromDesign } from "../../src/commands/block/from-design.js";
import { invokeAgent } from "../../src/lib/agents/invoke.js";

const FIGMA_URL = "https://www.figma.com/design/ABC123/Sample?node-id=1-2";

/** Make `invokeAgent` write a valid block + an optional agent-authored meta. */
function agentWrites(agentMeta?: Record<string, unknown>): void {
	vi.mocked(invokeAgent).mockImplementation(async (_agent, _prompt, root: string) => {
		const dir = path.join(root, "blocks", "hero");
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "hero.js"), "export default function decorate(block) {}\n");
		await writeFile(path.join(dir, "hero.css"), ".hero { display: block; }\n");
		await writeFile(
			path.join(dir, "_hero.json"),
			`${JSON.stringify({ definitions: [], models: [], filters: [] })}\n`,
		);
		if (agentMeta) {
			await writeFile(path.join(dir, ".eds-meta.json"), `${JSON.stringify(agentMeta)}\n`);
		}
		return true;
	});
}

async function readMeta(): Promise<Record<string, unknown>> {
	const file = path.join(h.root, "blocks", "hero", ".eds-meta.json");
	return JSON.parse(await readFile(file, "utf-8"));
}

describe("blockFromDesign - preview breakpoints in .eds-meta.json", () => {
	beforeEach(async () => {
		h.root = await mkdtemp(path.join(os.tmpdir(), "eds-fd-"));
		vi.mocked(invokeAgent).mockReset();
	});

	afterEach(async () => {
		if (h.root && existsSync(h.root)) await rm(h.root, { recursive: true, force: true });
		h.root = "";
		process.exitCode = undefined;
	});

	it("keeps the breakpoints the agent read from the design", async () => {
		agentWrites({
			breakpoints: [
				{ width: 390, source: "figma" },
				{ width: 1440, source: "figma" },
			],
		});

		await blockFromDesign(FIGMA_URL, { name: "hero", yes: true, screenshot: false, serve: false });

		const meta = await readMeta();
		expect(meta.breakpoints).toEqual([
			{ width: 390, label: "390 mobile", source: "figma" },
			{ width: 1440, label: "1440 desktop", source: "figma" },
		]);
	});

	it("lets --widths override the agent's breakpoints", async () => {
		agentWrites({ breakpoints: [{ width: 390, source: "figma" }] });

		await blockFromDesign(FIGMA_URL, {
			name: "hero",
			yes: true,
			screenshot: false,
			serve: false,
			widths: "768,1280",
		});

		const meta = await readMeta();
		expect(meta.breakpoints).toEqual([
			{ width: 768, label: "768 tablet", source: "figma" },
			{ width: 1280, label: "1280 desktop", source: "figma" },
		]);
	});

	it("omits breakpoints when neither the agent nor --widths provide any", async () => {
		agentWrites(); // agent writes no .eds-meta.json

		await blockFromDesign(FIGMA_URL, { name: "hero", yes: true, screenshot: false, serve: false });

		const meta = await readMeta();
		expect(meta.breakpoints).toBeUndefined();
		// still records the design reference it came from
		expect(meta.figmaFileKey).toBe("ABC123");
	});
});
