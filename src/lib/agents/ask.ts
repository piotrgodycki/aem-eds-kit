import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentInfo } from "../../types/index.js";
import { events } from "../events.js";
import { logger } from "../logger.js";
import { claudeCanConfine, confinedOnly, confinedToProject } from "./confine.js";
import { BLOCK_NAME, NEVER_FOR_CLAUDE, renderClaudeStream } from "./invoke.js";
import { chatLocal, isLocalAgent, LOCAL_DEFAULT_URLS, type LocalAgentType } from "./local.js";
import { sandboxed } from "./os-sandbox.js";

/**
 * `eds ask`: one read-only agent turn about the project. It keeps no state: a
 * caller with a conversation (aem-eds-studio's chat) passes the earlier turns
 * and attachments in, and keeps them itself. The agent may propose one action
 * for the caller to confirm; eds never runs it.
 */

export interface AskInput {
	message: string;
	history?: Array<{ role: "user" | "agent"; text: string }>;
	attachments?: Array<{ title: string; text: string }>;
}

export type AskAction =
	| { type: "block"; design: string; name: string }
	| { type: "refine"; name: string; feedback: string };

const ACTION_FENCE = /```eds-action\s*\n([\s\S]*?)\n```\s*$/;

/**
 * `drafts` are the project's open drafts: the only ones a `refine` can name.
 * A block in `blocks/` is not a draft, and a new block needs a design link.
 */
export function buildAskPrompt(input: AskInput, drafts: string[] = []): string {
	const parts = [
		"You help a developer with the AEM Edge Delivery Services project in the current folder.",
		"Answer the latest message. You may read the project's files; you can't change them.",
		"Be concise and concrete.",
		"",
		"If the developer wants something the studio can do, end your answer with one block like this and nothing after it:",
		"```eds-action",
		'{"type":"block","design":"<design URL>","name":"<block-name>"}',
		"```",
		'to build a block from a design, or {"type":"refine","name":"<draft>","feedback":"<what to change>"} to change a draft.',
		"Only propose it: the developer confirms before anything runs, so never say it is done.",
		drafts.length
			? `Open drafts you may propose to change: ${drafts.join(", ")}. A block in blocks/ is not a draft: never propose "refine" for any other name.`
			: 'There are no open drafts, so never propose "refine".',
		"A new block needs a design link (Figma, Framer, Stitch or any web page). Without one, ask the developer for it instead of proposing anything.",
	];
	for (const a of input.attachments ?? []) parts.push("", `## Attached: ${a.title}`, a.text);
	if (input.history?.length) {
		parts.push("", "## The conversation so far");
		for (const turn of input.history)
			parts.push(`${turn.role === "user" ? "Developer" : "You"}: ${turn.text}`);
	}
	parts.push("", "## Latest message", input.message);
	return parts.join("\n");
}

function validAction(raw: unknown): AskAction | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const a = raw as Record<string, unknown>;
	const name = typeof a.name === "string" && BLOCK_NAME.test(a.name) ? a.name : undefined;
	if (!name) return undefined;
	if (a.type === "block" && typeof a.design === "string" && /^https?:\/\//.test(a.design))
		return { type: "block", design: a.design, name };
	if (a.type === "refine" && typeof a.feedback === "string" && a.feedback.trim())
		return { type: "refine", name, feedback: a.feedback.trim() };
	return undefined;
}

/**
 * The answer without its action block, and the action when it is a valid one.
 * Given the open drafts, a `refine` naming any other draft is dropped.
 */
export function splitAction(
	reply: string,
	drafts?: string[],
): { text: string; action?: AskAction } {
	const m = reply.trimEnd().match(ACTION_FENCE);
	if (!m) return { text: reply.trim() };
	let action: AskAction | undefined;
	try {
		action = validAction(JSON.parse(m[1]));
		if (action?.type === "refine" && drafts && !drafts.includes(action.name)) action = undefined;
	} catch {
		// Not JSON: shown as text, nothing proposed.
	}
	return action
		? { text: reply.trimEnd().slice(0, m.index).trim(), action }
		: { text: reply.trim() };
}

/** Run one turn and return the agent's reply, or null when it couldn't answer. */
export async function askAgent(
	agent: AgentInfo,
	prompt: string,
	cwd: string,
	model: string | undefined,
	local: { contextTokens?: number; apiKey?: string } = {},
): Promise<string | null> {
	const { execa } = await import("execa");
	if (confinedOnly() && !(await confinedToProject(agent.type))) {
		logger.error(
			`${agent.type} can read files outside this project, and EDS_CONFINED_ONLY=1 allows only agents that can't. Use Claude Code (a version with --restricted) or a local model.`,
		);
		return null;
	}

	if (isLocalAgent(agent.type)) {
		const type = agent.type as LocalAgentType;
		const name = model ?? agent.model;
		if (!name) throw new Error("No model chosen for the local server - set local.model in config.");
		const reply = await chatLocal({
			type,
			baseUrl: agent.baseUrl ?? LOCAL_DEFAULT_URLS[type],
			model: name,
			prompt,
			apiKey: local.apiKey,
			contextTokens: local.contextTokens,
		});
		events.emit({
			type: "agent-result",
			agent: type,
			models: [name],
			...(reply.promptTokens || reply.outputTokens
				? {
						tokens: {
							input: reply.promptTokens ?? 0,
							output: reply.outputTokens ?? 0,
							cacheRead: 0,
							cacheWrite: 0,
						},
					}
				: {}),
		});
		return reply.text;
	}

	switch (agent.type) {
		case "claude": {
			const sub = execa(
				"claude",
				[
					"-p",
					"--model",
					model ?? "sonnet",
					"--output-format",
					"stream-json",
					"--verbose",
					...((await claudeCanConfine()) ? ["--restricted"] : []),
					"--allowedTools",
					"Read(./**),Glob,Grep",
					"--disallowedTools",
					[...NEVER_FOR_CLAUDE, "Edit", "Write", "NotebookEdit"].join(","),
				],
				{ cwd, buffer: false, input: prompt, stdio: ["pipe", "pipe", "inherit"] },
			);
			return (await renderClaudeStream(sub, cwd)) ?? null;
		}
		case "codex": {
			// Codex prints its work as it goes; the last message, the answer, goes to a file.
			const out = path.join(cwd, "tmp", "eds-cli", `ask-${Date.now()}.md`);
			await mkdir(path.dirname(out), { recursive: true });
			const args = [
				"exec",
				"--sandbox",
				"read-only",
				"--skip-git-repo-check",
				"--output-last-message",
				out,
				...(model ? ["--model", model] : []),
				"-",
			];
			const run = sandboxed(agent.path, args, {
				project: cwd,
				agentDirs: [".codex"],
				binary: agent.path,
			}) ?? { file: agent.path, args };
			await execa(run.file, run.args, {
				cwd,
				input: prompt,
				stdout: process.stderr,
				stderr: "inherit",
			});
			events.emit({ type: "agent-result", agent: "codex" });
			return await readFile(out, "utf-8");
		}
		default:
			logger.error(
				"Cursor can't answer here: its command hands the prompt to the Cursor app, and eds can't read the reply back. Use Claude Code, Codex or a local model.",
			);
			return null;
	}
}
