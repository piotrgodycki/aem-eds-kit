import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { CDN_TYPES, type CdnType, cdnCheck, cdnFiles, hostName } from "../lib/cdn.js";
import { githubRepo } from "../lib/draft-branch.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

/** The site's live origin on the main branch, from the GitHub remote or --origin. */
async function originOf(root: string, given?: string): Promise<string | null> {
	if (given) return hostName(given);
	try {
		const url = (await execa("git", ["remote", "get-url", "origin"], { cwd: root })).stdout;
		const r = githubRepo(url);
		return r ? `main--${r.repo.toLowerCase()}--${r.owner.toLowerCase()}.aem.live` : null;
	} catch {
		return null;
	}
}

/** `eds cdn setup <type> --host <domain>`: the CDN's settings from Adobe's guides, into cdn/<type>/. */
export async function cdnSetup(
	type: string,
	options: { host?: string; origin?: string },
): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	if (!(CDN_TYPES as readonly string[]).includes(type)) {
		logger.error(`Pick the CDN: ${CDN_TYPES.join(", ")}.`);
		process.exitCode = 1;
		return;
	}
	const host = hostName(options.host);
	if (!host) {
		logger.error("Name the production domain: --host www.example.com");
		process.exitCode = 1;
		return;
	}
	const origin = await originOf(root, options.origin);
	if (!origin) {
		logger.error(
			"No GitHub remote to find the origin from: give it with --origin main--<repo>--<owner>.aem.live",
		);
		process.exitCode = 1;
		return;
	}
	const dir = path.join("cdn", type);
	const written: string[] = [];
	for (const f of cdnFiles(type as CdnType, host, origin)) {
		const file = path.join(root, dir, f.file);
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, f.content);
		written.push(path.join(dir, f.file));
	}
	events.emit({ type: "cdn-setup", cdn: type, host, origin, files: written });
	logger.info(ui.heading(`${host} on ${type}`, `origin ${origin}`));
	for (const f of written) logger.info(ui.accentLine(f, ""));
	logger.info("");
	logger.info(chalk.dim(`  Follow ${dir}/README.md, then check the domain: eds cdn check ${host}`));
}

const MARK = { pass: chalk.green("✓"), fail: chalk.red("✗"), warn: chalk.yellow("!") };

/** `eds cdn check <domain>`: the live domain against the BYO CDN and go-live guides. */
export async function cdnCheckCommand(domain: string): Promise<void> {
	const host = hostName(domain);
	if (!host) {
		logger.error("Name the production domain: eds cdn check www.example.com");
		process.exitCode = 1;
		return;
	}
	const checks = await cdnCheck(host);
	events.emit({ type: "cdn-check", host, checks });
	logger.info(ui.heading(`CDN check, ${host}`));
	for (const c of checks) {
		logger.info(`  ${MARK[c.status]} ${c.what} ${chalk.dim(c.detail)}`);
		if (c.fix) logger.info(chalk.dim(`      ${c.fix}`));
	}
	const failed = checks.filter((c) => c.status === "fail").length;
	logger.info("");
	logger.info(
		failed
			? chalk.red(`  ${failed} to fix before go-live.`)
			: chalk.green(
					"  Nothing blocks go-live. Publish a small change and see it on the domain to test push invalidation.",
				),
	);
	if (failed) process.exitCode = 1;
}
