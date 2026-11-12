import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type AgentProbe, listAgentStatus } from "../../src/lib/agents/detect.js";

const probe = (over: Partial<AgentProbe> = {}): AgentProbe => ({
	which: async () => undefined,
	exists: () => false,
	figmaMcp: async () => undefined,
	local: async () => null,
	confined: async (t) => t === "claude",
	...over,
});

describe("eds agents (listAgentStatus)", () => {
	it("lists every agent, with how to install it, when none is here", async () => {
		const list = await listAgentStatus(probe());
		expect(list.map((a) => a.type)).toEqual(["claude", "cursor", "codex", "ollama", "omlx"]);
		expect(list.every((a) => !a.installed && !a.ready)).toBe(true);
		expect(list.find((a) => a.type === "codex")?.install).toBe("npm install -g @openai/codex");
	});

	it("tells an installed CLI from one that's signed in", async () => {
		const list = await listAgentStatus(
			probe({
				which: async (b) => (b === "claude" || b === "codex" ? `/usr/bin/${b}` : undefined),
				exists: (f) => f === path.join(homedir(), ".claude.json"),
				figmaMcp: async (paths) => (paths.length ? "figma-desktop" : undefined),
			}),
		);
		const claude = list.find((a) => a.type === "claude");
		const codex = list.find((a) => a.type === "codex");
		expect(claude).toMatchObject({
			installed: true,
			ready: true,
			path: "/usr/bin/claude",
			figmaMcp: true,
		});
		expect(codex).toMatchObject({ installed: true, ready: false });
		expect(codex?.signIn).toMatch(/codex login/);
		expect(claude?.confined).toBe(true);
		expect(codex?.confined).toBe(false);
	});

	it("counts a local server as ready only with a model", async () => {
		const list = await listAgentStatus(
			probe({ local: async (t) => (t === "ollama" ? ["llama3:8b", "qwen2.5-coder:14b"] : []) }),
		);
		expect(list.find((a) => a.type === "ollama")).toMatchObject({
			installed: true,
			ready: true,
			model: "qwen2.5-coder:14b",
		});
		expect(list.find((a) => a.type === "omlx")).toMatchObject({ installed: true, ready: false });
	});
});
