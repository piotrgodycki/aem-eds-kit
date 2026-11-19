import { previewUrl } from "../lib/draft-branch.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { classifyFiles, pagesForBlocks, scopeMarkdown } from "../lib/pr-scope.js";
import { findProjectRoot } from "../lib/project.js";
import { git, originRepo, projectBlocks, readSitePages, siteOrigins } from "../lib/site-pages.js";

interface ScopeOptions {
	base?: string;
	head?: string;
	domain?: string;
}

/** The branch a pull request goes into: the remote's default branch, else main. */
async function defaultBase(root: string): Promise<string> {
	const head = await git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	return head ?? "main";
}

/**
 * `eds pr scope`: what a branch changes, as a "What to test" section for its pull
 * request. The blocks it touches with the pages they are on, shared code, and
 * authoring changes, each page linked on the branch's preview.
 */
export async function prScope(options: ScopeOptions): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const base = options.base ?? (await defaultBase(root));
	const head = options.head ?? "HEAD";
	const diff = await git(root, ["diff", "--name-only", `${base}...${head}`]);
	if (
		diff === null &&
		!(await git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]))
	) {
		logger.error(`There is no ${base} to compare with. Pass --base.`);
		process.exitCode = 1;
		return;
	}
	const scope = classifyFiles(diff ? diff.split("\n") : []);
	const domain = options.domain?.trim().toLowerCase();
	// Pages are read only when a block changed: shared code reaches every page anyway.
	const known = new Set(await projectBlocks(root));
	const { site, pages } = scope.blocks.length
		? await readSitePages(await siteOrigins(root, domain), known)
		: { site: null, pages: [] };
	const blocks = pagesForBlocks(scope.blocks, site ? pages : null);

	const repo = await originRepo(root);
	const branch =
		head === "HEAD"
			? await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])
			: head.replace(/^origin\//, "");
	const preview = repo && branch && branch !== "HEAD" ? previewUrl(repo, branch) : null;
	const markdown = scopeMarkdown(scope, blocks, preview);

	events.emit({ type: "pr-scope", base, head, ...scope, blocks, preview, markdown });
	logger.info(markdown);
}
