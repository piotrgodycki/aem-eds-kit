import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import type { ResultPromise } from "execa";
import type { AgentInfo } from "../../types/index.js";
import { logger } from "../logger.js";
import * as ui from "../ui.js";

/**
 * Save a prompt to a temp file and return its path.
 */
export async function savePromptToFile(prompt: string): Promise<string> {
	const dir = path.join(tmpdir(), "eds-cli");
	await mkdir(dir, { recursive: true });
	const filename = `from-figma-${Date.now()}.md`;
	const filePath = path.join(dir, filename);
	await writeFile(filePath, prompt, "utf-8");
	return filePath;
}

/**
 * Invoke an AI agent with the given prompt file.
 * Returns true if the agent ran successfully.
 */
export async function invokeAgent(
	agent: AgentInfo,
	promptFile: string,
	cwd: string,
): Promise<boolean> {
	const { execa } = await import("execa");
	const prompt = await readFile(promptFile, "utf-8");

	try {
		switch (agent.type) {
			case "claude": {
				logger.info(`Running Claude Code ${chalk.dim("- live log:")}`);
				// Grant Figma MCP at the server level (`mcp__<server>` allows all of
				// its tools). We grant a *superset*, not just the detected server:
				// a user may have several Figma servers configured where the first
				// one found is stale/disconnected (e.g. a dead `figma-sse` alongside
				// a live plugin). Granting every known variant lets the agent fall
				// through to whichever one actually responds. Granting a server that
				// doesn't exist is harmless.
				const figmaServers = [
					...(agent.figmaMcpServerName ? [agent.figmaMcpServerName] : []),
					"figma-sse",
					"figma-desktop",
					"figma",
					"Figma",
					"plugin_figma_figma", // Claude Code plugin: plugin:figma:figma
				];
				const allowedTools = [
					...new Set(figmaServers.map((s) => `mcp__${s}`)),
					"Edit",
					"Write",
					"Read",
				].join(",");
				// Stream JSON events so we can render a live, colour-coded log of
				// what the agent is doing (tool calls, Figma MCP reads, file writes)
				// instead of a silent "this may take a minute".
				const sub = execa(
					"claude",
					[
						"-p",
						prompt,
						"--output-format",
						"stream-json",
						"--verbose",
						"--allowedTools",
						allowedTools,
					],
					{ cwd, buffer: false, stdio: ["ignore", "pipe", "inherit"] },
				);
				await renderClaudeStream(sub, cwd);
				break;
			}
			case "cursor": {
				logger.info("Running Cursor agent...");
				await execa("cursor", ["--prompt", prompt], {
					cwd,
					stdio: "inherit",
				});
				break;
			}
			case "codex": {
				logger.info("Running Codex...");
				await execa("codex", [prompt], {
					cwd,
					stdio: "inherit",
				});
				break;
			}
		}
		return true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(`Agent ${agent.type} failed: ${msg}`);
		return false;
	}
}

// ── Live stream renderer for Claude Code (`--output-format stream-json`) ──

interface ToolUseBlock {
	type: "tool_use";
	name: string;
	input?: Record<string, unknown>;
}
interface TextBlock {
	type: "text";
	text: string;
}
type ContentBlock = ToolUseBlock | TextBlock | { type: string };

interface StreamEvent {
	type?: string;
	message?: { content?: ContentBlock[] };
	duration_ms?: number;
	total_cost_usd?: number;
}

interface Rendered {
	/** Static log lines to print above the spinner. */
	lines: string[];
	/** Short label for the current activity (updates the spinner). */
	activity?: string;
	/** Final summary note (duration · cost) when the agent finishes. */
	result?: string;
}

/**
 * Read the agent's JSON event stream and render a live, animated log: an `ora`
 * spinner shows the current activity + elapsed time at the bottom while
 * colour-coded lines (Figma MCP reads, file writes, narration) scroll above it.
 */
async function renderClaudeStream(sub: ResultPromise, cwd: string): Promise<void> {
	const ora = (await import("ora")).default;
	const start = Date.now();
	const elapsed = () => `${Math.round((Date.now() - start) / 1000)}s`;
	const spinner = ora({ text: `thinking  ${chalk.dim(elapsed())}`, color: "yellow" }).start();
	let activity = "thinking";
	const timer = setInterval(() => {
		spinner.text = `${activity}  ${chalk.dim(elapsed())}`;
	}, 300);

	let result: string | undefined;
	try {
		if (sub.stdout) {
			const rl = readline.createInterface({ input: sub.stdout });
			for await (const line of rl) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				let rendered: Rendered;
				try {
					rendered = renderEvent(JSON.parse(trimmed) as StreamEvent, cwd);
				} catch {
					continue;
				}
				if (rendered.lines.length) {
					spinner.stop();
					for (const l of rendered.lines) logger.info(`   ${l}`);
					spinner.start();
				}
				if (rendered.activity) activity = rendered.activity;
				if (rendered.result) result = rendered.result;
			}
		}
		clearInterval(timer);
		if (result) spinner.succeed(`${ui.brand.accent("agent finished")}  ${chalk.dim(result)}`);
		else spinner.stop();
	} catch (err) {
		clearInterval(timer);
		spinner.stop();
		throw err;
	}
	await sub; // propagate a non-zero exit as a throw
}

function renderEvent(evt: StreamEvent, cwd: string): Rendered {
	const out: Rendered = { lines: [] };
	if (evt.type === "assistant" && Array.isArray(evt.message?.content)) {
		for (const block of evt.message.content) {
			if (block.type === "text" && "text" in block) {
				const first = block.text.trim().split("\n")[0].slice(0, 100);
				if (first) out.lines.push(chalk.dim(first));
			} else if (block.type === "tool_use" && "name" in block) {
				out.lines.push(toolLabel(block.name, block.input, cwd));
				out.activity = block.name.includes("figma")
					? (block.name.split("__").pop() ?? block.name)
					: block.name.toLowerCase();
			}
		}
		return out;
	}
	if (evt.type === "result") {
		const dur =
			typeof evt.duration_ms === "number" ? `${(evt.duration_ms / 1000).toFixed(1)}s` : "";
		const cost = typeof evt.total_cost_usd === "number" ? `$${evt.total_cost_usd.toFixed(3)}` : "";
		out.result = [dur, cost].filter(Boolean).join(" · ") || "done";
	}
	return out;
}

function toolLabel(name: string, input: Record<string, unknown> | undefined, cwd: string): string {
	const rel = (key: string): string => {
		const p = input?.[key];
		if (typeof p !== "string") return "";
		return p.startsWith(cwd) ? path.relative(cwd, p) : path.basename(p);
	};
	if (name.includes("figma")) {
		const short = name.split("__").pop() ?? name;
		return `${ui.icon.figma} ${chalk.bold(short)}  ${chalk.dim("Figma MCP")}`;
	}
	switch (name) {
		case "Write":
		case "Edit":
		case "NotebookEdit":
			return `${ui.brand.accent("✎")} ${chalk.cyan(rel("file_path"))}`;
		case "Read":
			return chalk.dim(`· read ${rel("file_path")}`);
		case "Bash": {
			const cmd =
				typeof input?.command === "string" ? input.command.split("\n")[0].slice(0, 70) : "";
			return chalk.dim(`$ ${cmd}`);
		}
		default:
			return `${ui.brand.blue("→")} ${name}`;
	}
}
