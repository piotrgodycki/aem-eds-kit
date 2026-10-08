import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { STANDARD_BLOCKS } from "../lib/scaffold/blocks.js";
import { mergeSectionFilter } from "../lib/scaffold/ue.js";
import { type AuthoringModel, detectAuthoring } from "../lib/template/authoring.js";
import { daEditUrl, pushToDa } from "../lib/template/da.js";
import { buildPageHtml } from "../lib/template/page.js";
import { buildUeTemplate } from "../lib/template/ue.js";
import * as ui from "../lib/ui.js";

export interface TemplateOptions {
	path?: string;
	title?: string;
	description?: string;
	blocks?: string[];
	area?: string;
	/** Force the authoring model (else detected from the project). */
	authoring?: AuthoringModel;
	/** Push the generated page to DA (da.live). */
	push?: boolean;
	org?: string;
	site?: string;
	yes?: boolean;
}

const slug = (s: string): string =>
	s
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-/]+/g, "-")
		.replace(/^-+|-+$/g, "");

async function projectBlocks(projectRoot: string): Promise<string[]> {
	const dir = path.join(projectRoot, "blocks");
	if (!existsSync(dir)) return [];
	return (await readdir(dir, { withFileTypes: true }))
		.filter((e) => e.isDirectory())
		.map((e) => e.name);
}

async function readEdsrcAdmin(projectRoot: string): Promise<{ org?: string; site?: string }> {
	const rc = path.join(projectRoot, ".edsrc.json");
	if (!existsSync(rc)) return {};
	try {
		return JSON.parse(await readFile(rc, "utf-8")).admin ?? {};
	} catch {
		return {};
	}
}

/** Register seeded blocks in component-filters.json so UE lets authors add them. */
async function registerBlocks(projectRoot: string, blocks: string[]): Promise<boolean> {
	if (!blocks.length) return false;
	const file = path.join(projectRoot, "component-filters.json");
	let existing: unknown = null;
	if (existsSync(file)) {
		try {
			existing = JSON.parse(await readFile(file, "utf-8"));
		} catch {
			existing = null;
		}
	}
	// biome-ignore lint/suspicious/noExplicitAny: filters JSON is free-form
	const filters = mergeSectionFilter(existing as any, blocks);
	await writeFile(file, `${JSON.stringify(filters, null, 2)}\n`);
	return true;
}

/**
 * `eds template new <name>` - generate EDS page initial content (sections +
 * blocks + metadata) and route it to the project's authoring model: push to DA,
 * output an importable doc for Google/SharePoint, or register the blocks for
 * Universal Editor. The EDS analog of an AEM template's initial content.
 */
export async function templateNew(nameArg: string, options: TemplateOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Page template");

	const { input, select, confirm } = await import("@inquirer/prompts");
	const interactive = !options.yes;

	const detected = await detectAuthoring(projectRoot);
	const model: AuthoringModel = options.authoring ?? detected.model;

	const name = slug(nameArg);
	const title =
		options.title ??
		(interactive ? await input({ message: "Page title", default: nameArg }) : nameArg);
	const description =
		options.description ?? (interactive ? await input({ message: "Description (optional)" }) : "");
	const pagePath = options.path ?? `/templates/${name}`;

	let blocks = options.blocks;
	if (!blocks && interactive) {
		const available = await projectBlocks(projectRoot);
		const pool = available.length ? available : STANDARD_BLOCKS.map((b) => b.id);
		// Add blocks in order (repeats allowed) - the author controls the sequence.
		const ordered: string[] = [];
		let adding = true;
		while (adding) {
			const pick = await select({
				message: `Add a block in order (${ordered.length} so far)`,
				choices: [
					...pool.map((b) => ({ name: b, value: b })),
					{ name: ordered.length ? "- done -" : "- done (empty page) -", value: "__done" },
				],
			});
			if (pick === "__done") adding = false;
			else ordered.push(pick);
		}
		blocks = ordered;
	}
	const seeded = blocks ?? [];

	const html = buildPageHtml({
		title,
		description: description || undefined,
		blocks: seeded,
		area: options.area,
	});

	// Always write a local copy (importable / reference).
	const localRel = path.join("templates", `${name}.html`);
	await mkdir(path.join(projectRoot, "templates"), { recursive: true });
	await writeFile(path.join(projectRoot, localRel), html);

	logger.info(ui.heading("Page template", `${pagePath}  ·  ${model}`));
	logger.info(ui.accentLine(localRel, `${seeded.length} block(s) + metadata`));

	// Route the content per authoring model.
	if (model === "da") {
		const admin = await readEdsrcAdmin(projectRoot);
		const org = options.org ?? admin.org ?? detected.org;
		const site = options.site ?? admin.site ?? detected.site;
		const wantPush =
			options.push ??
			(interactive ? await confirm({ message: "Push to DA (da.live)?", default: true }) : true);
		if (wantPush) {
			if (!org || !site) {
				logger.warn("No DA org/site. Pass --org/--site or set admin in .edsrc.json.");
			} else {
				try {
					await pushToDa(org, site, pagePath, html, process.env.DA_TOKEN);
					logger.info(ui.accentLine("pushed to DA", daEditUrl(org, site, pagePath)));
				} catch (err) {
					logger.error(`DA push failed: ${(err as Error).message}`);
					logger.info(chalk.dim("  Open projects allow anonymous writes; others need DA_TOKEN."));
				}
			}
		}
	} else if (model === "gdrive" || model === "sharepoint") {
		const where = model === "gdrive" ? "a Google Doc" : "a Word doc";
		logger.info("");
		logger.info(
			chalk.dim(`  Document model: import ${localRel} into ${where} in your mounted folder,`),
		);
		logger.info(
			chalk.dim("  then preview/publish. (Share the folder + install aem-code-sync first.)"),
		);
	} else if (model === "ue") {
		// Universal Editor: write the initial-content template JSON (ordered
		// components + default field values), and allow the blocks in authoring.
		const jsonRel = path.join("templates", `${name}.json`);
		await writeFile(
			path.join(projectRoot, jsonRel),
			await buildUeTemplate(projectRoot, { title, name, blocks: seeded }),
		);
		logger.info(
			ui.accentLine(jsonRel, `initial content (${seeded.length} component(s), in order)`),
		);
		const registered = await registerBlocks(projectRoot, seeded);
		if (registered) {
			logger.info(
				ui.accentLine("component-filters.json", "seeded blocks allowed in Universal Editor"),
			);
		}
		logger.info("");
		logger.info(
			chalk.dim("  Universal Editor: use the template JSON as the page's initial content, then"),
		);
		logger.info(chalk.dim("  author it in the Universal Editor (wire the repo to AEM)."));
	}

	logger.info("");
	logger.info(ui.box([`"${name}" template (${model}) - preview with \`eds preview ${pagePath}\``]));
}
