import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { STANDARD_BLOCKS } from "../lib/scaffold/blocks.js";
import { daEditUrl, pushToDa } from "../lib/template/da.js";
import { buildPageHtml } from "../lib/template/page.js";
import * as ui from "../lib/ui.js";

export interface TemplateOptions {
	path?: string;
	title?: string;
	description?: string;
	blocks?: string[];
	area?: string;
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

async function daConfig(
	projectRoot: string,
	options: TemplateOptions,
): Promise<{ org?: string; site?: string }> {
	let org = options.org;
	let site = options.site;
	const rc = path.join(projectRoot, ".edsrc.json");
	if ((!org || !site) && existsSync(rc)) {
		try {
			const admin = JSON.parse(await readFile(rc, "utf-8")).admin ?? {};
			org = org ?? admin.org;
			site = site ?? admin.site;
		} catch {
			// ignore
		}
	}
	return { org, site };
}

/**
 * `eds template new <name>` - generate EDS page initial content (sections +
 * blocks + metadata) and write it locally, optionally pushing to DA (da.live).
 * The EDS analog of an AEM template's initial content.
 */
export async function templateNew(nameArg: string, options: TemplateOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Page template");

	const { input, checkbox, confirm } = await import("@inquirer/prompts");
	const interactive = !options.yes;

	const name = slug(nameArg);
	const title =
		options.title ??
		(interactive ? await input({ message: "Page title", default: nameArg }) : nameArg);
	const description =
		options.description ?? (interactive ? await input({ message: "Description (optional)" }) : "");
	const pagePath = options.path ?? `/templates/${name}`;

	// Pick blocks to seed - the project's own blocks, or the standard set.
	let blocks = options.blocks;
	if (!blocks && interactive) {
		const available = (await projectBlocks(projectRoot)) || [];
		const choices = (available.length ? available : STANDARD_BLOCKS.map((b) => b.id)).map((b) => ({
			name: b,
			value: b,
		}));
		blocks = await checkbox({ message: "Which blocks to seed into the page?", choices });
	}

	const html = buildPageHtml({
		title,
		description: description || undefined,
		blocks: blocks ?? [],
		area: options.area,
	});

	// Always write a local copy (importable / reference).
	const localRel = path.join("templates", `${name}.html`);
	const localAbs = path.join(projectRoot, localRel);
	await mkdir(path.dirname(localAbs), { recursive: true });
	await writeFile(localAbs, html);

	logger.info(ui.heading("Page template", pagePath));
	logger.info(ui.accentLine(localRel, `${(blocks ?? []).length} block(s) + metadata`));

	// Optional push to DA.
	const wantPush =
		options.push ??
		(interactive ? await confirm({ message: "Push to DA (da.live)?", default: false }) : false);
	if (wantPush) {
		const { org, site } = await daConfig(projectRoot, options);
		if (!org || !site) {
			logger.warn("No DA org/site. Set admin.org/site in .edsrc.json or pass --org/--site.");
		} else {
			const token = process.env.DA_TOKEN;
			try {
				await pushToDa(org, site, pagePath, html, token);
				logger.info(ui.accentLine("pushed", daEditUrl(org, site, pagePath)));
			} catch (err) {
				logger.error(`DA push failed: ${(err as Error).message}`);
				logger.info(chalk.dim("  Open projects allow anonymous writes; others need DA_TOKEN."));
			}
		}
	}

	logger.info("");
	logger.info(
		ui.box([
			wantPush
				? `"${name}" template generated and pushed`
				: `"${name}" template at ${localRel} - preview with \`eds preview ${pagePath}\``,
		]),
	);
}
