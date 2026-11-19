import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { previewPage } from "../lib/admin-api.js";
import { askAgent } from "../lib/agents/ask.js";
import { detectAgent } from "../lib/agents/detect.js";
import { isLocalAgent } from "../lib/agents/local.js";
import { loadConfig } from "../lib/config.js";
import {
	buildContentPrompt,
	changedSections,
	parseContentAnswer,
	readDaPage,
} from "../lib/content.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { originRepo } from "../lib/site-pages.js";
import { detectAuthoring } from "../lib/template/authoring.js";
import { pushToDa } from "../lib/template/da.js";
import type { AgentType } from "../types/index.js";

interface ContentOptions {
	org?: string;
	site?: string;
	change?: string;
	file?: string;
	agent?: string;
	model?: string;
}

/** A page path as people write it: /products, products or /products.html are the same page. */
function pagePath(p: string): string | null {
	const clean = `/${p
		.trim()
		.replace(/^\/+/, "")
		.replace(/\.html$/i, "")}`;
	return /^\/[a-z0-9/_-]*$/i.test(clean) && !clean.includes("..") ? clean : null;
}

/** The project and its DA org and site: the flags, else .edsrc.json, else fstab.yaml. */
async function where(options: ContentOptions, p: string) {
	const root = findProjectRoot();
	const page = pagePath(p);
	if (!root || !page) {
		logger.error(
			!root
				? "Not inside an EDS project (no EDS project markers found)."
				: `"${p}" isn't a page path, e.g. /products.`,
		);
		process.exitCode = 1;
		return null;
	}
	const detected = await detectAuthoring(root);
	const rc = path.join(root, ".edsrc.json");
	const admin = existsSync(rc)
		? ((JSON.parse(await readFile(rc, "utf-8")).admin ?? {}) as { org?: string; site?: string })
		: {};
	const org = options.org ?? admin.org ?? detected.org;
	const site = options.site ?? admin.site ?? detected.site;
	if (!org || !site) {
		logger.error(
			"This works with DA (da.live) pages. Pass --org and --site, or set admin in .edsrc.json.",
		);
		process.exitCode = 1;
		return null;
	}
	return { root, page, org, site, token: process.env.DA_TOKEN };
}

/** `eds content get <path>`: a page's document from DA. */
export async function contentGet(p: string, options: ContentOptions): Promise<void> {
	const w = await where(options, p);
	if (!w) return;
	const html = await readDaPage(w.org, w.site, w.page, w.token);
	events.emit({ type: "content", path: w.page, html });
	if (!events.enabled) process.stdout.write(`${html}\n`);
}

/**
 * `eds content propose <path> --change "..."`: the agent changes the page as asked.
 * Nothing is written to DA: the changed document is kept in tmp/eds-cli/content/,
 * and the sections that differ are shown, for a person to accept with `put`.
 */
export async function contentPropose(p: string, options: ContentOptions): Promise<void> {
	const w = await where(options, p);
	if (!w) return;
	if (!options.change?.trim()) {
		logger.error('Say what to change: eds content propose /products --change "..."');
		process.exitCode = 1;
		return;
	}
	const before = await readDaPage(w.org, w.site, w.page, w.token);
	const config = await loadConfig(w.root);
	const agent = await detectAgent((options.agent as AgentType) || config.agent);
	if (!agent) {
		logger.error("No AI agent found (claude, codex, or a local Ollama / oMLX server).");
		process.exitCode = 1;
		return;
	}
	const model = isLocalAgent(agent.type)
		? (options.model ?? agent.model)
		: (options.model ?? config.model);
	const reply = await askAgent(
		agent,
		buildContentPrompt(w.page, before, options.change),
		w.root,
		model,
		{
			contextTokens: config.local?.contextTokens,
			apiKey: config.local?.apiKey,
		},
	);
	const answer = reply === null ? null : parseContentAnswer(reply);
	if (!answer) {
		logger.error(
			"The agent didn't answer with the changed page. Ask again, or say it differently.",
		);
		process.exitCode = 1;
		return;
	}
	const dir = path.join(w.root, "tmp", "eds-cli", "content");
	await mkdir(dir, { recursive: true });
	const file = path.join(
		dir,
		`${w.page.slice(1).replace(/[/]/g, "__") || "index"}-${Date.now()}.html`,
	);
	await writeFile(file, answer.html);
	const sections = changedSections(before, answer.html);
	const rel = path.relative(w.root, file).split(path.sep).join("/");
	events.emit({ type: "content-proposal", path: w.page, file: rel, note: answer.note, sections });
	if (!events.enabled) {
		logger.info(answer.note);
		for (const s of sections)
			logger.info(
				`\n  Section ${s.section}\n  - ${s.before || "(none)"}\n  + ${s.after || "(removed)"}`,
			);
		logger.info(`\n  Kept in ${rel}. Write it with: eds content put ${w.page} --file ${rel}`);
	}
}

/** `eds content put <path> --file <file>`: write the accepted document to DA and preview the page. */
export async function contentPut(p: string, options: ContentOptions): Promise<void> {
	const w = await where(options, p);
	if (!w) return;
	const file = options.file ? path.resolve(w.root, options.file) : "";
	if (!file || !file.startsWith(w.root + path.sep) || !existsSync(file)) {
		logger.error(
			"Name the changed page's file in the project: --file tmp/eds-cli/content/....html",
		);
		process.exitCode = 1;
		return;
	}
	await pushToDa(w.org, w.site, w.page, await readFile(file, "utf-8"), w.token);
	const repo = await originRepo(w.root);
	const preview = repo ? await previewPage({ org: repo.owner, site: repo.repo }, w.page) : null;
	events.emit({
		type: "content-saved",
		path: w.page,
		preview: preview?.ok ? (preview.previewUrl ?? null) : null,
	});
	if (!events.enabled)
		logger.info(
			preview?.ok
				? `Saved in DA and previewed: ${preview.previewUrl}`
				: `Saved in DA. The preview didn't run${preview ? ` (${preview.message})` : ""}: preview it with eds preview ${w.page}.`,
		);
}
