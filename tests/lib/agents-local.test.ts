import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	chatLocal,
	fileContract,
	parseFiles,
	pickModel,
	probeLocalServer,
	writeBlockFiles,
} from "../../src/lib/agents/local.js";

const stream = (chunks: string[]) =>
	new Response(
		new ReadableStream({
			start(c) {
				for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
				c.close();
			},
		}),
	);

describe("local agents: file contract", () => {
	it("tells the model the exact files and format", () => {
		const c = fileContract("hero");
		expect(c).toContain("=== FILE: blocks/hero/hero.js ===");
		expect(c).toContain("=== END FILE ===");
		expect(c).toContain("blocks/hero/_hero.json");
	});

	it("parses delimited files, stripping a code fence inside the markers", () => {
		const reply = [
			"Here you go.",
			"=== FILE: blocks/hero/hero.js ===",
			"```js",
			"export default function decorate(block) {}",
			"```",
			"=== END FILE ===",
			"=== FILE: blocks/hero/hero.css ===",
			".hero { color: red; }",
			"=== END FILE ===",
			"Done.",
		].join("\n");
		expect(parseFiles(reply)).toEqual([
			{ path: "blocks/hero/hero.js", content: "export default function decorate(block) {}" },
			{ path: "blocks/hero/hero.css", content: ".hero { color: red; }" },
		]);
	});

	it("falls back to path-labelled code fences", () => {
		const reply =
			"**blocks/hero/hero.css**\n```css\n.hero {}\n```\n\n```js blocks/hero/hero.js\nexport default () => {};\n```";
		expect(parseFiles(reply).map((f) => f.path)).toEqual([
			"blocks/hero/hero.css",
			"blocks/hero/hero.js",
		]);
	});

	it("writes only inside blocks/<name>/", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "eds-local-"));
		const r = await writeBlockFiles(root, "hero", [
			{ path: "blocks/hero/hero.js", content: "x" },
			{ path: "hero.css", content: ".hero{}" },
			{ path: "scripts/scripts.js", content: "evil" },
			{ path: "blocks/hero/../../package.json", content: "evil" },
		]);
		expect(r.written).toEqual(["blocks/hero/hero.js", "blocks/hero/hero.css"]);
		expect(r.rejected).toEqual(["scripts/scripts.js", "blocks/hero/../../package.json"]);
		expect(await readFile(path.join(root, "blocks/hero/hero.css"), "utf-8")).toBe(".hero{}\n");
		expect(existsSync(path.join(root, "scripts/scripts.js"))).toBe(false);
		await rm(root, { recursive: true, force: true });
	});

	it("prefers a coder model", () => {
		expect(pickModel(["llama3.2:3b", "qwen2.5-coder:14b", "mistral"])).toBe("qwen2.5-coder:14b");
		expect(pickModel(["mistral"])).toBe("mistral");
		expect(pickModel([])).toBeUndefined();
	});
});

describe("local agents: servers", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("lists Ollama and OpenAI-compatible models, null when down", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (u: string) => {
				if (u.endsWith("/api/tags"))
					return Response.json({ models: [{ name: "qwen2.5-coder:7b" }] });
				if (u === "http://x:8000/v1/models")
					return Response.json({ data: [{ id: "mlx-community/Qwen3-8B-4bit" }] });
				throw new Error("ECONNREFUSED");
			}),
		);
		expect(await probeLocalServer("ollama", "http://x:11434")).toEqual(["qwen2.5-coder:7b"]);
		expect(await probeLocalServer("omlx", "http://x:8000/v1")).toEqual([
			"mlx-community/Qwen3-8B-4bit",
		]);
		expect(await probeLocalServer("local", "http://down/v1")).toBeNull();
	});

	it("streams from Ollama's /api/chat with num_ctx and images", async () => {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, body: JSON.parse(String(init.body)) });
				return stream([
					'{"message":{"content":"=== FILE: blocks/a/a.js ===\\n"}}\n{"message":{"content":"x\\n=== END FILE ==="}}\n',
					'{"done":true,"prompt_eval_count":120,"eval_count":30}\n',
				]);
			}),
		);
		const seen: string[] = [];
		const r = await chatLocal({
			type: "ollama",
			baseUrl: "http://x:11434/",
			model: "qwen2.5vl:7b",
			prompt: "p",
			images: [{ data: Buffer.from("png"), mime: "image/png" }],
			contextTokens: 40000,
			onToken: (t) => seen.push(t),
		});
		expect(calls[0].url).toBe("http://x:11434/api/chat");
		expect(calls[0].body).toMatchObject({
			model: "qwen2.5vl:7b",
			stream: true,
			options: { num_ctx: 40000 },
			messages: [{ role: "user", content: "p", images: [Buffer.from("png").toString("base64")] }],
		});
		expect(r).toMatchObject({ promptTokens: 120, outputTokens: 30 });
		expect(seen.join("")).toBe(r.text);
		expect(parseFiles(r.text)).toEqual([{ path: "blocks/a/a.js", content: "x" }]);
	});

	it("streams SSE from an OpenAI-compatible server (oMLX) with an image part", async () => {
		let body: Record<string, unknown> = {};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_u: string, init: RequestInit) => {
				body = JSON.parse(String(init.body));
				return stream([
					'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
					'data: {"choices":[{"delta":{"content":"llo"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n',
					"data: [DONE]\n\n",
				]);
			}),
		);
		const r = await chatLocal({
			type: "omlx",
			baseUrl: "http://x:8000/v1",
			model: "m",
			prompt: "p",
			images: [{ data: Buffer.from("img"), mime: "image/png" }],
			apiKey: "k",
		});
		expect(r).toMatchObject({ text: "hello", promptTokens: 9, outputTokens: 2 });
		expect((body.messages as { content: unknown[] }[])[0].content).toEqual([
			{ type: "text", text: "p" },
			{
				type: "image_url",
				image_url: { url: `data:image/png;base64,${Buffer.from("img").toString("base64")}` },
			},
		]);
	});

	it("reports a server error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response('{"error":"model \\"x\\" not found"}', { status: 404 })),
		);
		await expect(
			chatLocal({ type: "ollama", baseUrl: "http://x", model: "x", prompt: "p" }),
		).rejects.toThrow(/Ollama 404.*not found/);
	});
});
