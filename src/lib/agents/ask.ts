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
	/** The action proposed under the last answer, still waiting for the developer's yes. */
	pending?: AskAction;
}

export type AskAction =
	| { type: "block"; design: string; name: string }
	| { type: "refine"; name: string; feedback: string };

const ACTION_FENCE = /```eds-action\s*\n([\s\S]*?)\n```\s*$/;

/**
 * `changeable` are the open drafts and the blocks in `blocks/`: the only names
 * a `refine` can take. Anything else is a new block, which needs a design link.
 */
export function buildAskPrompt(input: AskInput, changeable: string[] = []): string {
	const parts = [
		"You help a developer with the AEM Edge Delivery Services project in the current folder.",
		"Answer the latest message. You may read the project's files; you can't change them.",
		"Be concise and concrete.",
		"",
		"If the developer wants something the studio can do, end your answer with one block like this and nothing after it:",
		"```eds-action",
		'{"type":"block","design":"<design URL>","name":"<block-name>"}',
		"```",
		'to build a block from a design, or {"type":"refine","name":"<block-name>","feedback":"<what to change>"} to change a block or draft that exists.',
		"Only propose it: the developer confirms before anything runs, so never say it is done.",
		changeable.length
			? `Blocks and drafts you may propose to change: ${changeable.join(", ")}. A change needs no design. Never propose "refine" for any other name.`
			: 'There are no blocks or drafts yet, so never propose "refine".',
		"A new block needs a design link (Figma, Framer, Stitch or any web page). Without one, ask the developer for it instead of proposing anything.",
	];
	if (input.pending)
		parts.push(
			"",
			`Your last answer proposed this, and it waits for the developer's yes: ${JSON.stringify(input.pending)}`,
			'If the latest message just accepts it (yes, ok, do it, go ahead, in any language) and asks for nothing else, end your answer with ```eds-action\n{"type":"accept"}\n``` and nothing after it. If it accepts with a change, propose the changed action instead. Otherwise propose nothing about it.',
		);
	for (const a of input.attachments ?? []) parts.push("", `## Attached: ${a.title}`, a.text);
	if (input.history?.length) {
		parts.push("", "## The conversation so far");
		for (const turn of input.history)
			parts.push(`${turn.role === "user" ? "Developer" : "You"}: ${turn.text}`);
	}
	parts.push("", "## Latest message", input.message);
	return parts.join("\n");
}

/** The action as eds accepts it from an agent or a caller, or undefined when it isn't one. */
export function validAction(raw: unknown): AskAction | undefined {
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
 * Given what can be changed, a `refine` naming anything else is dropped.
 * `accepts` is set only when an action was pending and the agent said the
 * message accepts it: the caller then runs that action, never a new one.
 */
export function splitAction(
	reply: string,
	changeable?: string[],
	pending?: AskAction,
): { text: string; action?: AskAction; accepts?: true } {
	const m = reply.trimEnd().match(ACTION_FENCE);
	if (!m) return { text: reply.trim() };
	let action: AskAction | undefined;
	try {
		const raw = JSON.parse(m[1]) as { type?: unknown };
		if (raw?.type === "accept")
			return pending
				? { text: reply.trimEnd().slice(0, m.index).trim(), accepts: true }
				: { text: reply.trimEnd().slice(0, m.index).trim() };
		action = validAction(raw);
		if (action?.type === "refine" && changeable && !changeable.includes(action.name))
			action = undefined;
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
