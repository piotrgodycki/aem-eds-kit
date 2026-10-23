/**
 * Clone an EDS boilerplate into a local folder - no GitHub auth, no repo
 * created on GitHub (that's `eds sandbox new`). By default the copy starts a
 * fresh git history; `keepHistory` keeps the boilerplate's, with its remote
 * renamed to `upstream` so later boilerplate changes can be pulled in.
 */

import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { BOILERPLATES } from "./sandbox/github.js";

export interface Boilerplate {
	/** What `git clone` gets. */
	url: string;
	/** Short name for messages (`adobe/aem-boilerplate`, or the URL). */
	label: string;
	/** The Universal Editor (crosswalk) boilerplate. */
	ue: boolean;
}

/** Adobe Commerce storefront on EDS (Drop-ins). */
export const COMMERCE_BOILERPLATE = "hlxsites/aem-boilerplate-commerce";

const ALIASES: Record<string, string> = {
	commerce: COMMERCE_BOILERPLATE,
	document: BOILERPLATES.document,
	doc: BOILERPLATES.document,
	da: BOILERPLATES.document,
	ue: BOILERPLATES.ue,
	xwalk: BOILERPLATES.ue,
	crosswalk: BOILERPLATES.ue,
};

/** Resolve `--boilerplate`: an alias, `owner/repo` on GitHub, or any git URL / local path. */
export function resolveBoilerplate(input?: string, ue = false): Boilerplate {
	const raw = (input ?? (ue ? BOILERPLATES.ue : BOILERPLATES.document)).trim();
	const ref = ALIASES[raw.toLowerCase()] ?? raw;
	const isUe = (s: string) => /xwalk/i.test(s);
	if (/^[\w.-]+\/[\w.-]+$/.test(ref) && !existsSync(ref)) {
		return { url: `https://github.com/${ref}.git`, label: ref, ue: isUe(ref) };
	}
	const short = ref.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1];
	return { url: ref, label: short ?? ref, ue: isUe(ref) };
}

/** True when the folder is missing or empty (the only targets we clone into). */
export async function isEmptyDir(dir: string): Promise<boolean> {
	if (!existsSync(dir)) return true;
	try {
		return (await readdir(dir)).length === 0;
	} catch {
		return false;
	}
}

export interface CloneOptions {
	/** Branch or tag to clone (default: the boilerplate's default branch). */
	ref?: string;
	/** Keep the boilerplate's history (remote renamed to `upstream`). */
	keepHistory?: boolean;
	/** Set `origin` to this URL (your own repo). */
	remote?: string;
	/** Streams git's progress to the terminal. */
	stdio?: "inherit" | "pipe";
}

export interface CloneResult {
	/** The boilerplate commit the copy was made from. */
	commit: string;
	/** A fresh-history copy whose initial commit couldn't be made (no git identity). */
	uncommitted: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: execa is imported dynamically
type Execa = any;

/** Clone `bp` into `dir` (which must be missing or empty). Removes a half-made folder on failure. */
export async function cloneBoilerplate(
	bp: Boilerplate,
	dir: string,
	opts: CloneOptions = {},
): Promise<CloneResult> {
	const { execa }: Execa = await import("execa");
	const git = (args: string[], cwd?: string, stdio: "inherit" | "pipe" = "pipe") =>
		execa("git", args, { cwd, stdio });
	const existed = existsSync(dir);
	const branch = opts.ref ? ["--branch", opts.ref] : [];
	try {
		if (opts.keepHistory) {
			await git(["clone", ...branch, "--origin", "upstream", bp.url, dir], undefined, opts.stdio);
		} else {
			await git(["clone", "--depth", "1", ...branch, bp.url, dir], undefined, opts.stdio);
		}
	} catch (err) {
		if (!existed) await rm(dir, { recursive: true, force: true });
		else
			for (const f of await readdir(dir))
				await rm(path.join(dir, f), { recursive: true, force: true });
		const e = err as { code?: string; stderr?: string; shortMessage?: string };
		if (e.code === "ENOENT") throw new Error("git isn't installed (or not on PATH).");
		const detail = (e.stderr ?? "").trim().split("\n").pop() || e.shortMessage || String(err);
		// GitHub answers a missing (or private, unauthenticated) repo with a credentials prompt.
		if (/could not read Username|Repository not found|not found/i.test(detail)) {
			throw new Error(
				`Couldn't clone ${bp.label}: the repo doesn't exist, or it's private (check the name; for a private repo use an SSH URL or set up git credentials).`,
			);
		}
		throw new Error(`Couldn't clone ${bp.label}: ${detail}`);
	}

	const commit = (await git(["rev-parse", "HEAD"], dir)).stdout.trim();
	let uncommitted = false;
	if (!opts.keepHistory) {
		await rm(path.join(dir, ".git"), { recursive: true, force: true });
		await git(["init", "--quiet"], dir);
		await git(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
		await git(["add", "-A"], dir);
		try {
			await git(
				["commit", "--quiet", "-m", `Initial commit from ${bp.label}@${commit.slice(0, 7)}`],
				dir,
			);
		} catch {
			uncommitted = true; // no user.name / user.email - the files stay staged
		}
	}
	if (opts.remote) await git(["remote", "add", "origin", opts.remote], dir);
	return { commit, uncommitted };
}
