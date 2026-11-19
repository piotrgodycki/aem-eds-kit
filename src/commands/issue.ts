import { readFile } from "node:fs/promises";
import { askAgent } from "../lib/agents/ask.js";
import { detectAgent } from "../lib/agents/detect.js";
import { isLocalAgent } from "../lib/agents/local.js";
import { loadConfig } from "../lib/config.js";
import { events } from "../lib/events.js";
import { buildIssuePrompt, type IssueNotes, parseIssue } from "../lib/issue-write.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import type { AgentType } from "../types/index.js";

interface IssueOptions {
	input?: string;
	kind?: string;
	title?: string;
	notes?: string;
	agent?: string;
	model?: string;
}

/** The notes from `--input` (a JSON file) or the flags. */
async function readNotes(o: IssueOptions): Promise<IssueNotes | null> {
	const raw = o.input ? (JSON.parse(await readFile(o.input, "utf-8")) as Partial<IssueNotes>) : o;
	const kind = (["feature", "bug", "task"] as const).find((k) => k === raw.kind) ?? null;
	const title = typeof raw.title === "string" ? raw.title.trim() : "";
	if (!kind || !title) return null;
	const notes = typeof (raw as IssueNotes).notes === "string" ? (raw as IssueNotes).notes : "";
	const block = (raw as IssueNotes).block;
	return {
		kind,
		title,
		notes,
		...(block && /^[a-z0-9-]+$/.test(block.name) ? { block } : {}),
	};
}

/** `eds issue write`: an issue's title and body, written by the agent from a person's notes. */
export async function issueWrite(options: IssueOptions): Promise<void> {
	const root = findProjectRoot(process.cwd()) ?? process.cwd();
	const notes = await readNotes(options);
	if (!notes) {
		logger.error(
			'Give a kind and a title: eds issue write --kind feature|bug|task --title "..." --notes "..."',
		);
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
	const reply = await askAgent(agent, buildIssuePrompt(notes), root, model, {
		contextTokens: config.local?.contextTokens,
		apiKey: config.local?.apiKey,
	});
	if (reply === null) {
		process.exitCode = 1;
		return;
	}
	const issue = parseIssue(reply, notes.title);
	events.emit({ type: "issue-draft", kind: notes.kind, ...issue });
	if (!events.enabled) process.stdout.write(`${issue.title}\n\n${issue.body}\n`);
}
