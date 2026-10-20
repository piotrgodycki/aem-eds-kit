/**
 * Local LLM agents: Ollama, oMLX (Apple Silicon) and any OpenAI-compatible
 * server. Unlike Claude Code / Cursor / Codex they can't read or write files or
 * call MCP, so the CLI sends the whole prompt (design data embedded, an image
 * attached for a PNG/JPG export), asks for every file in a delimited format,
 * and writes the files itself - only inside `blocks/<name>/`.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type LocalAgentType = "ollama" | "omlx" | "local";

export const LOCAL_AGENT_TYPES: LocalAgentType[] = ["ollama", "omlx", "local"];

/** Default server per local agent (Ollama's native API; OpenAI-compatible /v1 for the rest). */
export const LOCAL_DEFAULT_URLS: Record<LocalAgentType, string> = {
	ollama: "http://127.0.0.1:11434",
	omlx: "http://127.0.0.1:8000/v1",
	local: "http://127.0.0.1:8080/v1",
};

export const LOCAL_NAMES: Record<LocalAgentType, string> = {
	ollama: "Ollama",
	omlx: "oMLX",
	local: "local OpenAI-compatible server",
};

/** Context we ask Ollama for by default (its own default, 2-4k tokens, can't hold a design prompt). */
export const DEFAULT_CONTEXT_TOKENS = 32768;

export function isLocalAgent(type: string | undefined): type is LocalAgentType {
	return LOCAL_AGENT_TYPES.includes(type as LocalAgentType);
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/** List the models a local server has (null when it isn't reachable). */
export async function probeLocalServer(
	type: LocalAgentType,
	baseUrl = LOCAL_DEFAULT_URLS[type],
	timeoutMs = 1500,
): Promise<string[] | null> {
	const url = type === "ollama" ? `${trimSlash(baseUrl)}/api/tags` : `${trimSlash(baseUrl)}/models`;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			models?: { name?: string; model?: string }[];
			data?: { id?: string }[];
		};
		const names =
			type === "ollama"
				? (data.models ?? []).map((m) => m.name ?? m.model ?? "")
				: (data.data ?? []).map((m) => m.id ?? "");
		return names.filter(Boolean);
	} catch {
		return null;
	}
}

/** Prefer a code model; else the first one the server lists. */
export function pickModel(models: string[]): string | undefined {
	const prefs = [/coder/i, /codestral|devstral/i, /code/i, /qwen/i, /deepseek/i, /llama/i];
	for (const re of prefs) {
		const hit = models.find((m) => re.test(m));
		if (hit) return hit;
	}
	return models[0];
}

/** Rough token estimate for a prompt (≈ 3.5 chars per token for code-heavy text). */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 3.5);
}

export interface LocalImage {
	data: Buffer;
	mime: string;
}

export interface LocalChatOptions {
	type: LocalAgentType;
	baseUrl: string;
	model: string;
	prompt: string;
	images?: LocalImage[];
	apiKey?: string;
	/** Ollama `num_ctx`. */
	contextTokens?: number;
	/** Called with each streamed piece of the reply. */
	onToken?: (chunk: string) => void;
	signal?: AbortSignal;
}

export interface LocalChatResult {
	text: string;
	promptTokens?: number;
	outputTokens?: number;
}

/** Read a streamed body line by line. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const dec = new TextDecoder();
	let buf = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		let i = buf.indexOf("\n");
		while (i >= 0) {
			yield buf.slice(0, i);
			buf = buf.slice(i + 1);
			i = buf.indexOf("\n");
		}
	}
	if (buf.trim()) yield buf;
}

/** Send one prompt to a local model and stream the reply. */
export async function chatLocal(opts: LocalChatOptions): Promise<LocalChatResult> {
	const base = trimSlash(opts.baseUrl);
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;

	let url: string;
	let body: unknown;
	if (opts.type === "ollama") {
		url = `${base}/api/chat`;
		body = {
			model: opts.model,
			stream: true,
			messages: [
				{
					role: "user",
					content: opts.prompt,
					...(opts.images?.length
						? { images: opts.images.map((i) => i.data.toString("base64")) }
						: {}),
				},
			],
			options: { num_ctx: opts.contextTokens ?? DEFAULT_CONTEXT_TOKENS, temperature: 0.2 },
		};
	} else {
		url = `${base}/chat/completions`;
		const content = opts.images?.length
			? [
					{ type: "text", text: opts.prompt },
					...opts.images.map((i) => ({
						type: "image_url",
						image_url: { url: `data:${i.mime};base64,${i.data.toString("base64")}` },
					})),
				]
			: opts.prompt;
		body = {
			model: opts.model,
			stream: true,
			temperature: 0.2,
			messages: [{ role: "user", content }],
		};
	}

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal: opts.signal,
	});
	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => "");
		throw new Error(
			`${LOCAL_NAMES[opts.type]} ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
		);
	}

	let text = "";
	const out: LocalChatResult = { text: "" };
	for await (const raw of lines(res.body)) {
		const line = raw.trim();
		if (!line) continue;
		if (opts.type === "ollama") {
			const evt = JSON.parse(line) as {
				message?: { content?: string };
				done?: boolean;
				error?: string;
				prompt_eval_count?: number;
				eval_count?: number;
			};
			if (evt.error) throw new Error(`Ollama: ${evt.error}`);
			const piece = evt.message?.content ?? "";
			if (piece) {
				text += piece;
				opts.onToken?.(piece);
			}
			if (evt.done) {
				out.promptTokens = evt.prompt_eval_count;
				out.outputTokens = evt.eval_count;
			}
		} else {
			if (!line.startsWith("data:")) continue;
			const data = line.slice(5).trim();
			if (data === "[DONE]") break;
			const evt = JSON.parse(data) as {
				choices?: { delta?: { content?: string } }[];
				usage?: { prompt_tokens?: number; completion_tokens?: number };
				error?: { message?: string };
			};
			if (evt.error) throw new Error(`${LOCAL_NAMES[opts.type]}: ${evt.error.message}`);
			const piece = evt.choices?.[0]?.delta?.content ?? "";
			if (piece) {
				text += piece;
				opts.onToken?.(piece);
			}
			if (evt.usage) {
				out.promptTokens = evt.usage.prompt_tokens;
				out.outputTokens = evt.usage.completion_tokens;
			}
		}
	}
	out.text = text;
	return out;
}

// ── File contract: the model writes files as text, the CLI saves them ─────────

const FILE_START = /^=+\s*FILE:\s*(.+?)\s*=+\s*$/;
const FILE_END = /^=+\s*END FILE\s*=+\s*$/;

/** The output-format section appended to the prompt for a local model. */
export function fileContract(blockName: string): string {
	const dir = `blocks/${blockName}`;
	return `

## Output format for this run (local model, no tools) — this overrides the instructions above
You cannot read files, run commands, call MCP or use editing tools: everything you need is in this message. Ignore any instruction above to read a file, fetch the design or call a tool.
Reply with **every file you create, complete**, each wrapped exactly like this (no other markdown around it):

=== FILE: ${dir}/${blockName}.js ===
...the whole file...
=== END FILE ===

Write \`${dir}/${blockName}.js\`, \`${dir}/${blockName}.css\`, the Universal Editor model \`${dir}/_${blockName}.json\` (unless told to skip it), the preview mock \`${dir}/_${blockName}.preview.html\` and \`${dir}/.eds-meta.json\`. Only paths under \`${dir}/\` are saved. After the files, at most 3 lines of summary.`;
}

export interface ParsedFile {
	path: string;
	content: string;
}

/** Pull files out of a model reply: the `=== FILE: … ===` contract, else path-labelled code fences. */
export function parseFiles(reply: string): ParsedFile[] {
	const files: ParsedFile[] = [];
	const rows = reply.split(/\r?\n/);
	let cur: { path: string; body: string[] } | null = null;
	for (const row of rows) {
		const start = row.match(FILE_START);
		if (start && !FILE_END.test(row)) {
			if (cur) files.push({ path: cur.path, content: cur.body.join("\n") });
			cur = { path: start[1].replace(/^`|`$/g, ""), body: [] };
			continue;
		}
		if (cur && FILE_END.test(row)) {
			files.push({ path: cur.path, content: cur.body.join("\n") });
			cur = null;
			continue;
		}
		if (cur) cur.body.push(row);
	}
	if (cur) files.push({ path: cur.path, content: cur.body.join("\n") });
	if (files.length) return files.map(stripFence);

	// Fallback: ```js blocks/hero/hero.js  or a "blocks/hero/hero.js" line right before a fence.
	const fence =
		/(?:^|\n)(?:[#*`\s]*([\w./-]+\.(?:js|css|json|html))[`*:\s]*\n)?```[\w-]*[ \t]*([\w./-]+\.(?:js|css|json|html))?[^\n]*\n([\s\S]*?)\n```/g;
	for (const m of reply.matchAll(fence)) {
		const p = m[2] ?? m[1];
		if (p) files.push({ path: p, content: m[3] });
	}
	return files;
}

/** A model sometimes wraps the file body in a code fence inside the markers. */
function stripFence(f: ParsedFile): ParsedFile {
	const m = f.content.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/);
	return m ? { ...f, content: m[1] } : f;
}

export interface WriteResult {
	written: string[];
	rejected: string[];
}

/** Save parsed files, but only inside `blocks/<name>/` (a bare file name lands there too). */
export async function writeBlockFiles(
	projectRoot: string,
	blockName: string,
	files: ParsedFile[],
): Promise<WriteResult> {
	const dir = path.join(projectRoot, "blocks", blockName);
	const result: WriteResult = { written: [], rejected: [] };
	for (const f of files) {
		const rel = f.path.trim().replace(/^\.?\//, "");
		const target = rel.includes("/") ? path.resolve(projectRoot, rel) : path.join(dir, rel);
		if (path.dirname(target) !== dir) {
			result.rejected.push(f.path);
			continue;
		}
		await mkdir(dir, { recursive: true });
		await writeFile(target, f.content.endsWith("\n") ? f.content : `${f.content}\n`);
		result.written.push(path.relative(projectRoot, target));
	}
	return result;
}

/** The block's current files, as the same delimited text (for a refine pass). */
export async function currentBlockFiles(projectRoot: string, blockName: string): Promise<string> {
	const dir = path.join(projectRoot, "blocks", blockName);
	if (!existsSync(dir)) return "";
	const parts: string[] = [];
	for (const name of (await readdir(dir)).sort()) {
		if (!/\.(js|css|json|html)$/.test(name)) continue;
		const body = await readFile(path.join(dir, name), "utf-8");
		parts.push(`=== FILE: blocks/${blockName}/${name} ===\n${body.trimEnd()}\n=== END FILE ===`);
	}
	return parts.join("\n\n");
}
