/**
 * Drafts: a generated block that hasn't been accepted yet. Each generation or
 * review round is a version under `tmp/eds-cli/drafts/<name>/v<N>/`; nothing
 * reaches `blocks/<name>/` until the draft is accepted. While an agent works on
 * a draft it writes into `blocks/<name>/` as usual, so any block already there
 * is set aside first and put back afterwards.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DesignProvider } from "./figma/prompt-builder.js";
import type { FigmaUrlParts } from "./schemas.js";

export interface DraftVersion {
	version: number;
	createdAt: string;
	/** The review comment this round answered (none for v1). */
	feedback?: string;
	/** Whether the generated files passed the checks. */
	ok: boolean;
	files: string[];
	/** The commit on the draft's branch, once pushed (eds draft push). */
	commit?: string;
}

export interface Draft {
	name: string;
	status: "open" | "accepted" | "discarded";
	source: {
		/** The design it came from; none for a draft started from a block in `blocks/`. */
		provider?: DesignProvider;
		designRef?: string;
		figma?: FigmaUrlParts | null;
		agent?: string;
		model?: string;
		/** Started from the block already in `blocks/<name>/`, which is its v1. */
		fromBlock?: boolean;
	};
	versions: DraftVersion[];
	accepted?: { version: number; at: string; commit?: string };
	/** The git branch the versions are committed on, and its aem.page preview. */
	branch?: string;
	preview?: string;
}

const draftsRoot = (projectRoot: string) => path.join(projectRoot, "tmp", "eds-cli", "drafts");
const draftDir = (projectRoot: string, name: string) => path.join(draftsRoot(projectRoot), name);
const draftFile = (projectRoot: string, name: string) =>
	path.join(draftDir(projectRoot, name), "draft.json");
export const versionDir = (projectRoot: string, name: string, version: number) =>
	path.join(draftDir(projectRoot, name), `v${version}`);
export const blockDir = (projectRoot: string, name: string) =>
	path.join(projectRoot, "blocks", name);

export async function readDraft(projectRoot: string, name: string): Promise<Draft | null> {
	const file = draftFile(projectRoot, name);
	if (!existsSync(file)) return null;
	return JSON.parse(await readFile(file, "utf-8")) as Draft;
}

export async function writeDraft(projectRoot: string, draft: Draft): Promise<void> {
	await mkdir(draftDir(projectRoot, draft.name), { recursive: true });
	await writeFile(draftFile(projectRoot, draft.name), `${JSON.stringify(draft, null, 2)}\n`);
}

export async function listDrafts(projectRoot: string): Promise<Draft[]> {
	const root = draftsRoot(projectRoot);
	if (!existsSync(root)) return [];
	const drafts: Draft[] = [];
	for (const e of await readdir(root, { withFileTypes: true })) {
		if (!e.isDirectory()) continue;
		const d = await readDraft(projectRoot, e.name);
		if (d) drafts.push(d);
	}
	return drafts.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Start a draft from the block already in `blocks/<name>/`, so it can be
 * changed without a design: v1 is the block as it is. The design it came
 * from, if `.eds-meta.json` names one, stays the draft's source.
 */
export async function draftFromBlock(projectRoot: string, name: string): Promise<Draft> {
	const meta = await readMeta(path.join(blockDir(projectRoot, name), ".eds-meta.json"));
	await captureVersion(projectRoot, name, {
		source: {
			...(meta.provider ? { provider: meta.provider } : {}),
			...(meta.designRef ? { designRef: meta.designRef } : {}),
			...(meta.figmaFileKey
				? { figma: { fileKey: meta.figmaFileKey, nodeId: meta.figmaNodeId ?? undefined } }
				: {}),
			fromBlock: true,
		},
		ok: true,
	});
	return (await readDraft(projectRoot, name)) as Draft;
}

interface BlockMeta {
	provider?: DesignProvider;
	designRef?: string;
	figmaFileKey?: string | null;
	figmaNodeId?: string | null;
}

async function readMeta(file: string): Promise<BlockMeta> {
	try {
		return JSON.parse(await readFile(file, "utf-8")) as BlockMeta;
	} catch {
		return {};
	}
}

/**
 * Set aside whatever is in `blocks/<name>/` (the accepted block, if any) so an
 * agent can write a draft there, optionally starting from a draft version.
 * Returns the function that puts the original back; call it in a `finally`.
 */
export async function stageBlock(
	projectRoot: string,
	name: string,
	from?: number,
): Promise<() => Promise<void>> {
	const live = blockDir(projectRoot, name);
	const stash = path.join(draftDir(projectRoot, name), ".stash");
	await rm(stash, { recursive: true, force: true });
	const hadLive = existsSync(live);
	if (hadLive) {
		await mkdir(path.dirname(stash), { recursive: true });
		await rename(live, stash);
	}
	if (from !== undefined) {
		await cp(versionDir(projectRoot, name, from), live, { recursive: true });
	}
	return async () => {
		await rm(live, { recursive: true, force: true });
		if (hadLive) await rename(stash, live);
	};
}

/**
 * Move what the agent wrote to `blocks/<name>/` into the next draft version.
 * Call before restoring the stage. Returns the new version number.
 */
export async function captureVersion(
	projectRoot: string,
	name: string,
	info: { source: Draft["source"]; feedback?: string; ok: boolean },
): Promise<number> {
	const draft: Draft = (await readDraft(projectRoot, name)) ?? {
		name,
		status: "open",
		source: info.source,
		versions: [],
	};
	const version = (draft.versions.at(-1)?.version ?? 0) + 1;
	const target = versionDir(projectRoot, name, version);
	await rm(target, { recursive: true, force: true });
	await mkdir(path.dirname(target), { recursive: true });
	await cp(blockDir(projectRoot, name), target, { recursive: true });
	const files = (await readdir(target)).sort();
	draft.status = "open";
	draft.versions.push({
		version,
		createdAt: new Date().toISOString(),
		...(info.feedback ? { feedback: info.feedback } : {}),
		ok: info.ok,
		files,
	});
	await writeDraft(projectRoot, draft);
	return version;
}

/** Copy a draft version into `blocks/<name>/` (replacing what's there) and mark it accepted. */
export async function acceptDraft(
	projectRoot: string,
	name: string,
	version?: number,
): Promise<{ draft: Draft; version: number }> {
	const draft = await readDraft(projectRoot, name);
	if (!draft) throw new Error(`No draft "${name}".`);
	const v = version ?? draft.versions.at(-1)?.version;
	if (!v || !draft.versions.some((x) => x.version === v)) {
		throw new Error(`Draft "${name}" has no version ${version ?? ""}.`.trim());
	}
	const live = blockDir(projectRoot, name);
	await rm(live, { recursive: true, force: true });
	await cp(versionDir(projectRoot, name, v), live, { recursive: true });
	draft.status = "accepted";
	draft.accepted = { version: v, at: new Date().toISOString() };
	await writeDraft(projectRoot, draft);
	return { draft, version: v };
}

/** Record the commit an accepted draft went into. */
export async function recordCommit(
	projectRoot: string,
	name: string,
	commit: string,
): Promise<void> {
	const draft = await readDraft(projectRoot, name);
	if (!draft?.accepted) return;
	draft.accepted.commit = commit;
	await writeDraft(projectRoot, draft);
}

/** Drop a draft and all its versions; `blocks/` is untouched. */
export async function discardDraft(projectRoot: string, name: string): Promise<boolean> {
	const dir = draftDir(projectRoot, name);
	if (!existsSync(dir)) return false;
	await rm(dir, { recursive: true, force: true });
	return true;
}

/** The commit message for an accepted draft: the design and every review round. */
export function acceptMessage(draft: Draft, version: number): string {
	const fromBlock = draft.source.fromBlock;
	const from = !fromBlock && draft.source.designRef ? ` from ${draft.source.designRef}` : "";
	const first = fromBlock ? "the block as it was" : "first version";
	const rounds = draft.versions
		.filter((v) => v.version <= version)
		.map((v) => `- v${v.version}: ${v.feedback ? `"${v.feedback}"` : first}`);
	return `feat(blocks): ${fromBlock ? "update " : ""}${draft.name}${from}\n\nAccepted draft v${version} after ${rounds.length === 1 ? "one version" : `${rounds.length} versions`}:\n${rounds.join("\n")}\n`;
}
