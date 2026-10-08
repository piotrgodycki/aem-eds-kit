import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The `.env` consumed by the AEM CLI (`aem up`): which path to open, the proxy
 * port, and the content origin to proxy from. Generated on demand - never read
 * back (it may hold other secrets) and never committed (we gitignore it).
 */

export interface EnvOptions {
	/** Path opened in the browser when the proxy starts. */
	open?: string;
	/** Local proxy port. */
	port?: string | number;
	/** Content origin to proxy from (e.g. the aem.page preview host). */
	pagesUrl?: string;
}

/** Build the `.env` contents. */
export function buildEnv(opts: EnvOptions = {}): string {
	const open = opts.open ?? "/";
	const port = opts.port ?? 3007;
	const pagesUrl = opts.pagesUrl ?? "";
	return `AEM_OPEN=${open}\nAEM_PORT=${port}\nAEM_PAGES_URL=${pagesUrl}\n`;
}

/** Ensure `.gitignore` ignores `.env`. Returns true if it changed. */
export async function ensureEnvIgnored(projectRoot: string): Promise<boolean> {
	const file = path.join(projectRoot, ".gitignore");
	let current = "";
	if (existsSync(file)) current = await readFile(file, "utf-8");
	if (current.split(/\r?\n/).some((l) => l.trim() === ".env")) return false;
	const prefix = current && !current.endsWith("\n") ? "\n" : "";
	await writeFile(file, `${current}${prefix}.env\n`);
	return true;
}

export interface EnvResult {
	path: string;
	created: boolean;
	gitignoreUpdated: boolean;
}

/**
 * Write `.env` at the project root. Never overwrites an existing one (and never
 * reads it), but always makes sure `.env` is gitignored.
 */
export async function writeEnv(projectRoot: string, opts: EnvOptions = {}): Promise<EnvResult> {
	const file = path.join(projectRoot, ".env");
	const created = !existsSync(file);
	if (created) await writeFile(file, buildEnv(opts));
	const gitignoreUpdated = await ensureEnvIgnored(projectRoot);
	return { path: ".env", created, gitignoreUpdated };
}
