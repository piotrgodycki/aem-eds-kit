import { existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { githubRepo, previewUrl } from "../lib/draft-branch.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { startServer } from "../lib/preview/server.js";
import { findProjectRoot } from "../lib/project.js";
import { waitForStop } from "../lib/session.js";
import { parseSpec, templatePage } from "../lib/template/spec.js";
import * as ui from "../lib/ui.js";

interface TemplatePreviewOptions {
	port?: string;
	/** The site to take /nav, /footer and their images from, e.g. https://www.example.com. */
	site?: string;
}

/** What a page fetches from the site rather than the code: fragments, sheets, media. */
const FROM_SITE = /(\.plain\.html|\.json|\/media_[^/]+)$/;

/** Shown when the site can't be reached, so the page still has a header and a footer. */
const FALLBACK: Record<string, string> = {
	"/nav.plain.html":
		'<div><p><a href="/">Site</a></p></div><div><ul><li><a href="/">Products</a></li><li><a href="/">About</a></li></ul></div><div></div>',
	"/footer.plain.html": "<div><p>Footer from the site's /footer page.</p></div>",
};

async function mainPreview(root: string): Promise<string | null> {
	const { execa } = await import("execa");
	try {
		const remote = (await execa("git", ["remote", "get-url", "origin"], { cwd: root })).stdout;
		const repo = githubRepo(remote);
		return repo ? previewUrl(repo, "main").replace(/\/$/, "") : null;
	} catch {
		return null;
	}
}

/** One file from the site, as the page would get it on aem.page, or undefined. */
async function fromSite(site: string | null, urlPath: string) {
	if (site) {
		try {
			const res = await fetch(`${site}${urlPath}`, { signal: AbortSignal.timeout(10_000) });
			if (res.ok)
				return {
					body: Buffer.from(await res.arrayBuffer()),
					type: res.headers.get("content-type") ?? "application/octet-stream",
				};
		} catch {
			// the site is unreachable: fall back below
		}
	}
	const fallback = FALLBACK[urlPath];
	return fallback ? { body: fallback, type: "text/html; charset=utf-8" } : undefined;
}

/**
 * `eds template preview <spec>`: the template as a whole page, with the project's
 * own scripts, styles and blocks, and the site's header and footer. The page is
 * built from the spec on every request, so a change to the spec shows on reload,
 * and the open page reloads by itself.
 */
export async function templatePreview(
	specFile: string,
	options: TemplatePreviewOptions,
): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const file = path.resolve(specFile);
	if (!existsSync(file)) {
		logger.error(`No template spec at ${specFile}.`);
		process.exitCode = 1;
		return;
	}
	const first = parseSpec(await readFile(file, "utf-8"));
	const site = options.site?.replace(/\/$/, "") ?? (await mainPreview(root));
	const page = `/templates/${first.name}`;
	const reloadScript =
		"<script>try { new EventSource('/__eds_events').onmessage = () => location.reload(); } catch (e) {}</script>";

	const server = await startServer(
		root,
		{},
		Number.parseInt(options.port ?? "8790", 10),
		"127.0.0.1",
		async (urlPath) => {
			if (urlPath === "/" || urlPath === page) {
				const html = await templatePage(root, parseSpec(await readFile(file, "utf-8")));
				return {
					body: html.replace("</body>", `${reloadScript}\n</body>`),
					type: "text/html; charset=utf-8",
				};
			}
			if (!FROM_SITE.test(urlPath) || existsSync(path.join(root, urlPath))) return undefined;
			return fromSite(site, urlPath);
		},
	);
	const watcher = watch(file, () => server.reload());
	const url = `${server.url.replace(/\/$/, "")}${page}`;

	logger.info(ui.heading("Template preview", first.title));
	logger.info(`  ${chalk.bold("➜")}  ${chalk.cyan(url)}`);
	logger.info(
		ui.statusLine(
			site ? "pass" : "warn",
			"header and footer",
			site ? `from ${site}` : "the site isn't known, so a stand-in is shown (pass --site)",
		),
	);
	events.emit({ type: "preview", name: first.name, url });

	await waitForStop(async () => {
		watcher.close();
		await server.close();
	});
}
