/**
 * A draft on a git branch. With Edge Delivery Services every branch pushed to
 * GitHub has a live preview at https://<branch>--<repo>--<owner>.aem.page/, so
 * each draft version also becomes a commit on `draft/<name>`. The commits are
 * written with git's plumbing and a private index: the working tree, the
 * current branch and the user's staged changes are never touched.
 */

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readDraft, versionDir, writeDraft } from "./draft.js";

/** The branch a draft's versions go on: the one it started with, else draft/<name>. */
export const draftBranch = (name: string, draft?: { branch?: string } | null) =>
	draft?.branch ?? `draft/${name}`;

/**
 * A branch name the draft may start with: what git accepts, e.g. feature/CURLY-111
 * or bug/CURLY-123. Returns the reason it can't, or null.
 */
export function badBranchName(branch: string): string | null {
	if (
		!/^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+(?<![./])$/.test(branch) ||
		branch.length > 100
	)
		return `"${branch}" isn't a branch name git accepts (e.g. feature/CURLY-111).`;
	if (/^(main|master|HEAD)$/.test(branch)) return `A draft can't be committed on ${branch}.`;
	return null;
}

type Git = (args: string[], env?: Record<string, string>) => Promise<string>;

async function gitIn(root: string): Promise<Git> {
	const { execa } = await import("execa");
	return async (args, env) =>
		(await execa("git", args, { cwd: root, env: { ...process.env, ...env } })).stdout.trim();
}

/** `owner/repo` of a GitHub remote URL (https or ssh), or null for anything else. */
export function githubRepo(remoteUrl: string): { owner: string; repo: string } | null {
	const m = remoteUrl.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
	return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * The aem.page preview of a branch. EDS lowercases the branch and replaces
 * anything but letters and digits with a dash.
 */
export function previewUrl(remote: { owner: string; repo: string }, branch: string): string {
	const host = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	return `https://${host(branch)}--${host(remote.repo)}--${host(remote.owner)}.aem.page/`;
}

/** The commit a draft's first version branches off: the remote's default branch, else HEAD. */
async function baseCommit(git: Git): Promise<string> {
	for (const ref of ["refs/remotes/origin/HEAD", "HEAD"]) {
		try {
			return await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		} catch {
			// try the next one
		}
	}
	throw new Error("This project's git repository has no commits yet.");
}

async function filesUnder(dir: string, prefix = ""): Promise<string[]> {
	const out: string[] = [];
	for (const e of await readdir(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) out.push(...(await filesUnder(path.join(dir, e.name), rel)));
		else if (e.isFile()) out.push(rel);
	}
	return out.sort();
}

/**
 * Commit a draft version on `draft/<name>`: the parent commit's tree with
 * `blocks/<name>/` replaced by the version's files. Returns the commit.
 */
async function commitVersion(
	root: string,
	name: string,
	branch: string,
	version: number,
	message: string,
): Promise<string> {
	const git = await gitIn(root);
	const parent = await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).catch(() =>
		baseCommit(git),
	);
	const index = path.join(root, "tmp", "eds-cli", `draft-index-${name}`);
	const env = { GIT_INDEX_FILE: index };
	try {
		await git(["read-tree", parent], env);
		// -f: the index is our own, so its blocks/<name> differing from the working
		// tree (a block that is already on disk) is expected, not a reason to stop.
		await git(["rm", "--cached", "-r", "-q", "-f", "--ignore-unmatch", `blocks/${name}`], env);
		const dir = versionDir(root, name, version);
		for (const rel of await filesUnder(dir)) {
			const blob = await git(["hash-object", "-w", path.join(dir, rel)]);
			await git(
				["update-index", "--add", "--cacheinfo", `100644,${blob},blocks/${name}/${rel}`],
				env,
			);
		}
		const tree = await git(["write-tree"], env);
		const commit = await git(["commit-tree", tree, "-p", parent, "-m", message]);
		await git(["update-ref", `refs/heads/${branch}`, commit]);
		return commit;
	} finally {
		await rm(index, { force: true });
	}
}

/**
 * Put a draft version on its branch and push it to `origin`, recording the
 * branch, the commit and the preview in draft.json. Pushing is skipped (and
 * the preview left out) when `origin` isn't on GitHub.
 */
/** The remote's default branch, as a local ref: origin/HEAD, else origin/main or origin/master. */
async function baseRef(git: Git): Promise<string | null> {
	for (const ref of [
		"refs/remotes/origin/HEAD",
		"refs/remotes/origin/main",
		"refs/remotes/origin/master",
	]) {
		const ok = await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).then(
			() => true,
			() => false,
		);
		if (ok) return ref;
	}
	return null;
}

/**
 * How many commits the default branch has that draft/<name> doesn't, as of
 * the last fetch; undefined without a branch or a remote default branch.
 */
export async function behindBase(root: string, name: string): Promise<number | undefined> {
	const git = await gitIn(root);
	const base = await baseRef(git);
	const branch = `refs/heads/${draftBranch(name, await readDraft(root, name))}`;
	if (!base) return undefined;
	try {
		return Number(await git(["rev-list", "--count", `${branch}..${base}`]));
	} catch {
		return undefined;
	}
}

/**
 * Bring the default branch's newer commits into draft/<name> with a merge
 * commit, written with git's plumbing (the working tree is untouched), and
 * push it. On a conflict nothing changes and the conflicting files are named.
 */
export async function updateFromBase(
	root: string,
	name: string,
): Promise<{ branch: string; commit: string; merged: number; preview?: string; pushed: boolean }> {
	const git = await gitIn(root);
	const branch = draftBranch(name, await readDraft(root, name));
	const tip = await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).catch(
		() => "",
	);
	if (!tip) throw new Error(`The draft "${name}" has no branch yet; push a version first.`);
	await git(["fetch", "--quiet", "origin"]);
	const base = await baseRef(git);
	if (!base) throw new Error("origin has no default branch to update from.");
	const merged = Number(await git(["rev-list", "--count", `${tip}..${base}`]));
	if (!merged) return { branch, commit: tip, merged: 0, pushed: false };
	let tree: string;
	try {
		tree = (await git(["merge-tree", "--write-tree", "--name-only", tip, base])).split("\n")[0];
	} catch (err) {
		// Exit 1: the first line is the tree, then the files in conflict, then messages.
		const out = String((err as { stdout?: string }).stdout ?? "");
		const files = out.split("\n\n")[0].split("\n").slice(1).filter(Boolean);
		throw new Error(
			`Updating draft/${name} from the default branch conflicts in: ${files.join(", ") || "some files"}. Resolve it on the branch by hand.`,
		);
	}
	// origin/HEAD names the branch it points at, e.g. origin/main.
	const label = (await git(["rev-parse", "--abbrev-ref", base])).replace(/^origin\//, "");
	const commit = await git([
		"commit-tree",
		tree,
		"-p",
		tip,
		"-p",
		base,
		"-m",
		`Merge ${label} into ${branch}`,
	]);
	await git(["update-ref", `refs/heads/${branch}`, commit, tip]);
	const preview = await pushBranch(git, branch);
	return { branch, commit, merged, ...(preview ? { preview } : {}), pushed: !!preview };
}

/** Push draft/<name> to origin when origin is on GitHub; returns its preview, or null. */
async function pushBranch(git: Git, branch: string): Promise<string | null> {
	const remote = githubRepo(await git(["remote", "get-url", "origin"]).catch(() => ""));
	if (!remote) return null;
	await git(["push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
	return previewUrl(remote, branch);
}

/**
 * Accept a version on the draft's branch: when it is the branch's tip it is
 * only pushed; an earlier version goes on top as a new commit.
 */
export async function acceptOnBranch(
	root: string,
	name: string,
	version: number,
): Promise<{ branch: string; commit: string; preview?: string; pushed: boolean }> {
	const draft = await readDraft(root, name);
	const chosen = draft?.versions.find((x) => x.version === version);
	if (!draft || !chosen) throw new Error(`Draft "${name}" has no version ${version}.`);
	const git = await gitIn(root);
	const branch = draftBranch(name, draft);
	const tip = await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).catch(
		() => "",
	);
	if (!tip || chosen.commit !== tip)
		return pushVersion(root, name, version, `${name}: back to v${version} for the pull request`);
	const preview = await pushBranch(git, branch);
	return { branch, commit: tip, ...(preview ? { preview } : {}), pushed: !!preview };
}

/** A version's commit message, in English whatever language the review was in. */
function versionMessage(name: string, version: number, fromBlock: boolean, reviewed: boolean) {
	if (reviewed) return `${name} v${version}: changes from review`;
	return `${name} v${version}: ${fromBlock ? "the block as it was" : "first version"}`;
}

export async function pushVersion(
	root: string,
	name: string,
	version: number,
	message?: string,
): Promise<{ branch: string; commit: string; preview?: string; pushed: boolean }> {
	const draft = await readDraft(root, name);
	const v = draft?.versions.find((x) => x.version === version);
	if (!draft || !v) throw new Error(`Draft "${name}" has no version ${version}.`);
	const git = await gitIn(root);
	const branch = draftBranch(name, draft);
	const commit = await commitVersion(
		root,
		name,
		branch,
		version,
		message ?? versionMessage(name, version, draft.source.fromBlock === true, !!v.feedback),
	);
	const preview = await pushBranch(git, branch);
	// An earlier version accepted again gets a new commit; the newest one is what the branch holds.
	if (!message) v.commit = commit;
	draft.branch = branch;
	if (preview) draft.preview = preview;
	await writeDraft(root, draft);
	return { branch, commit, ...(preview ? { preview } : {}), pushed: !!preview };
}
