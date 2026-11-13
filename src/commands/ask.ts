import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { type AskInput, askAgent, buildAskPrompt, splitAction } from "../lib/agents/ask.js";
import { detectAgent } from "../lib/agents/detect.js";
import { isLocalAgent } from "../lib/agents/local.js";
import { loadConfig } from "../lib/config.js";
import { listDrafts } from "../lib/draft.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import type { AgentType } from "../types/index.js";

/** The message and context, from `--input` (a JSON file, or "-" for stdin) or the argument. */
async function readInput(
	message: string | undefined,
	input: string | undefined,
): Promise<AskInput> {
	if (!input) return { message: message ?? "" };
	const raw = input === "-" ? await text(process.stdin) : await readFile(input, "utf-8");
	const parsed = JSON.parse(raw) as Partial<AskInput>;
	return {
		message: String(parsed.message ?? message ?? ""),
		history: parsed.history?.filter(
			(t) => (t?.role === "user" || t?.role === "agent") && typeof t.text === "string",
		),
		attachments: parsed.attachments?.filter(
			(a) => typeof a?.title === "string" && typeof a.text === "string",
		),
	};
}

/** `eds ask "<message>"`: one read-only agent turn about the project. */
export async function ask(
	message: string | undefined,
	options: { agent?: string; model?: string; input?: string },
): Promise<void> {
	const root = findProjectRoot(process.cwd()) ?? process.cwd();
	const input = await readInput(message, options.input);
	if (!input.message.trim()) {
		logger.error('Say what to ask: eds ask "<message>"');
		process.exitCode = 1;
		return;
	}
	const config = await loadConfig(root);
	const agent = await detectAgent((options.agent as AgentType) || config.agent);
	if (!agent) {
		logger.error("No AI agent found (claude, codex, or a local Ollama / oMLX server).");
		process.exitCode = 1;
		return;
	}
	const model = isLocalAgent(agent.type)
		? (options.model ?? agent.model)
		: (options.model ?? config.model);

	const drafts = (await listDrafts(root)).filter((d) => d.status === "open").map((d) => d.name);
	const reply = await askAgent(agent, buildAskPrompt(input, drafts), root, model, {
		contextTokens: config.local?.contextTokens,
		apiKey: config.local?.apiKey,
	});
	if (reply === null) {
		process.exitCode = 1;
		return;
	}
	const { text, action } = splitAction(reply, drafts);
	events.emit({ type: "answer", text, ...(action ? { action } : {}) });
	if (!events.enabled) {
		process.stdout.write(`${text}\n`);
		if (action) process.stdout.write(`\nProposed: ${JSON.stringify(action)}\n`);
	}
}
