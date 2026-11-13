import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { detectAgent } from "../lib/agents/detect.js";
import { invokeAgent, savePromptToFile } from "../lib/agents/invoke.js";
import { isLocalAgent } from "../lib/agents/local.js";
import { loadConfig } from "../lib/config.js";
import {
	acceptDraft,
	acceptMessage,
	blockDir,
	type Draft,
	discardDraft,
	draftFromBlock,
	listDrafts,
	readDraft,
	recordCommit,
	versionDir,
	writeDraft,
} from "../lib/draft.js";
import { events } from "../lib/events.js";
import { buildRefinePrompt } from "../lib/figma/prompt-builder.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";
import type { AgentType } from "../types/index.js";

function projectOrExit(): string | null {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
	}
	return root ?? null;
}

async function draftOrExit(root: string, name: string) {
	const draft = await readDraft(root, name);
	if (!draft) {
		logger.error(
			`No draft "${name}". Create one with: eds block from-design <design> --name ${name} --draft`,
		);
		process.exitCode = 1;
	}
	return draft;
}

const parseVersion = (v?: string) => (v ? Number.parseInt(v.replace(/^v/i, ""), 10) : undefined);

/** `eds draft list` */
export async function draftList(): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	const drafts = await listDrafts(root);
	events.emit({ type: "drafts", drafts });
	logger.info(ui.heading("Drafts", `${drafts.length} in tmp/eds-cli/drafts/`));
	if (!drafts.length) {
		logger.info(
			chalk.dim("  None. Start one with: eds block from-design <design> --name <block> --draft"),
		);
		return;
	}
	const w = ui.columnWidth(drafts.map((d) => d.name));
	for (const d of drafts) {
		const last = d.versions.at(-1);
		const state =
			d.status === "accepted"
				? `accepted v${d.accepted?.version}`
				: `${d.versions.length} version${d.versions.length === 1 ? "" : "s"}, latest v${last?.version}${last?.ok === false ? " (issues)" : ""}`;
		logger.info(
			ui.accentLine(d.name, `${state}${last?.feedback ? `  · "${last.feedback}"` : ""}`, w),
		);
	}
}

/** `eds draft preview <name> [version]` */
export async function draftPreview(
	name: string,
	options: { version?: string; port?: string; widths?: string; open?: boolean },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	const draft = await draftOrExit(root, name);
	if (!draft) return;
	const v = parseVersion(options.version) ?? draft.versions.at(-1)?.version;
	if (!v || !existsSync(versionDir(root, name, v))) {
		logger.error(`Draft "${name}" has no version ${options.version ?? ""}.`.trim());
		process.exitCode = 1;
		return;
	}
	logger.info(chalk.dim(`  Draft "${name}" v${v} (not in blocks/ until accepted)`));
	const { previewBlock } = await import("./block/preview.js");
	await previewBlock(name, { ...options, blockDir: versionDir(root, name, v), version: v });
}

/** `eds draft refine <name> "<feedback>"`: one more agent pass on the latest version. */
export async function draftRefine(
	name: string,
	feedback: string,
	options: { agent?: string; model?: string; version?: string; push?: boolean },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	if (!feedback?.trim()) {
		logger.error('Say what to change: eds draft refine <name> "<what to change>"');
		process.exitCode = 1;
		return;
	}
	// A block already in blocks/ can be changed without a design: it becomes the draft's v1.
	const draft =
		!(await readDraft(root, name)) && existsSync(blockDir(root, name))
			? await draftFromBlock(root, name)
			: await draftOrExit(root, name);
	if (!draft) return;
	const from = parseVersion(options.version) ?? draft.versions.at(-1)?.version;
	if (!from || !draft.versions.some((x) => x.version === from)) {
		logger.error(`Draft "${name}" has no version ${options.version ?? ""}.`.trim());
		process.exitCode = 1;
		return;
	}
	const config = await loadConfig(root);
	const agent = await detectAgent(
		(options.agent as AgentType) || (draft.source.agent as AgentType) || config.agent,
	);
	if (!agent) {
		logger.error("No AI agent found (claude, cursor, codex, or a local Ollama / oMLX server).");
		process.exitCode = 1;
		return;
	}
	const model = isLocalAgent(agent.type)
		? (options.model ?? agent.model)
		: (options.model ?? draft.source.model ?? config.model);

	const prompt = buildRefinePrompt({
		blockName: name,
		feedback: feedback.trim(),
		provider: draft.source.provider,
		figma: draft.source.figma ?? null,
		designRef: draft.source.designRef,
	});
	const promptFile = await savePromptToFile(prompt, root);
	logger.info(
		`  ${chalk.dim("→")} Round on v${from} with ${chalk.cyan(agent.type)}: ${chalk.dim(feedback.trim())}`,
	);

	const { generateDraft, verifyGeneratedBlock, writeBlockMeta } = await import(
		"./block/from-design.js"
	);
	await generateDraft({
		projectRoot: root,
		blockName: name,
		from,
		feedback: feedback.trim(),
		push: options.push,
		source: { ...draft.source, agent: agent.type, model },
		run: () =>
			invokeAgent(agent, promptFile, root, model, {
				blockName: name,
				refine: true,
				contextTokens: config.local?.contextTokens,
				apiKey: config.local?.apiKey,
			}),
		verify: (dir) => verifyGeneratedBlock(dir, name, true, "document"),
		writeMeta: (dir) =>
			writeBlockMeta(dir, {
				provider: draft.source.provider,
				designRef: draft.source.designRef,
				figma: draft.source.figma ?? null,
				agentType: agent.type,
			}),
	});
}

/** `eds draft accept <name> [version] [--commit] [--branch <b>]` */
export async function draftAccept(
	name: string,
	options: { version?: string; commit?: boolean; branch?: string; onBranch?: boolean },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	if (!(await draftOrExit(root, name))) return;
	if (options.onBranch) return acceptOnBranch(root, name, parseVersion(options.version));
	let accepted: Awaited<ReturnType<typeof acceptDraft>>;
	try {
		accepted = await acceptDraft(root, name, parseVersion(options.version));
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	logger.success(`Accepted "${name}" v${accepted.version} → blocks/${name}/`);
	if (!options.commit && !options.branch) {
		events.emit({ type: "accepted", name, version: accepted.version });
		logger.info(
			chalk.dim("  Not committed. Commit it yourself, or re-run with --commit [--branch <name>]."),
		);
		return;
	}
	try {
		const { execa } = await import("execa");
		const git = (args: string[]) => execa("git", args, { cwd: root });
		if (options.branch) {
			const exists = await git([
				"rev-parse",
				"--verify",
				"--quiet",
				`refs/heads/${options.branch}`,
			]).then(
				() => true,
				() => false,
			);
			await git(exists ? ["switch", options.branch] : ["switch", "-c", options.branch]);
		}
		await git(["add", "--", path.join("blocks", name)]);
		await git([
			"commit",
			"-m",
			acceptMessage(accepted.draft, accepted.version),
			"--",
			path.join("blocks", name),
		]);
		const sha = (await git(["rev-parse", "--short", "HEAD"])).stdout.trim();
		await recordCommit(root, name, sha);
		events.emit({
			type: "accepted",
			name,
			version: accepted.version,
			commit: sha,
			...(options.branch ? { branch: options.branch } : {}),
		});
		logger.success(`Committed ${sha}${options.branch ? ` on ${options.branch}` : ""}.`);
	} catch (err) {
		const e = err as { stderr?: string; message: string };
		logger.error(`Commit failed: ${(e.stderr || e.message).trim().split("\n").pop()}`);
		logger.info(chalk.dim(`  The files are in blocks/${name}/; commit them yourself.`));
		process.exitCode = 1;
	}
}

/**
 * Accept a draft on its branch: the branch's tip becomes the chosen version
 * (a new commit when an earlier one is picked) and is pushed. The working
 * tree's blocks/ stays as it is; the caller opens the pull request.
 */
async function acceptOnBranch(root: string, name: string, version?: number): Promise<void> {
	const draft = await readDraft(root, name);
	const v = version ?? draft?.versions.at(-1)?.version;
	const chosen = draft?.versions.find((x) => x.version === v);
	if (!draft || !v || !chosen) {
		logger.error(`Draft "${name}" has no version ${version ?? ""}.`.trim());
		process.exitCode = 1;
		return;
	}
	const { acceptOnBranch: accept } = await import("../lib/draft-branch.js");
	try {
		const r = await accept(root, name, v);
		const accepted = (await readDraft(root, name)) as Draft;
		accepted.status = "accepted";
		accepted.accepted = { version: v, at: new Date().toISOString(), commit: r.commit.slice(0, 7) };
		await writeDraft(root, accepted);
		events.emit({
			type: "accepted",
			name,
			version: v,
			commit: r.commit.slice(0, 7),
			branch: r.branch,
			...(r.preview ? { preview: r.preview } : {}),
			title: `feat(blocks): ${accepted.source.fromBlock ? "update " : ""}${name}`,
			body: acceptMessage(accepted, v),
		});
		logger.success(`Accepted "${name}" v${v} on ${r.branch}. Open a pull request from it.`);
	} catch (err) {
		const e = err as { stderr?: string; message: string };
		logger.error(`Accept failed: ${(e.stderr || e.message).trim().split("\n").pop()}`);
		process.exitCode = 1;
	}
}

/**
 * Commit a draft version on draft/<name> and push it; on failure (no git
 * identity, no access to origin) the draft itself is fine and stays local.
 */
export async function pushDraft(root: string, name: string, version: number): Promise<boolean> {
	const { pushVersion } = await import("../lib/draft-branch.js");
	try {
		const r = await pushVersion(root, name, version);
		events.emit({ type: "pushed", name, version, ...r });
		logger.success(
			r.pushed
				? `Pushed v${version} to ${r.branch}${r.preview ? `: ${r.preview}` : ""}`
				: `Committed v${version} on ${r.branch} (origin isn't on GitHub, so it wasn't pushed).`,
		);
		return true;
	} catch (err) {
		const e = err as { stderr?: string; message: string };
		logger.error(`Couldn't push v${version}: ${(e.stderr || e.message).trim().split("\n").pop()}`);
		process.exitCode = 1;
		return false;
	}
}

/**
 * `eds draft shot <name> [version] [--push]`: screenshot the version at each
 * breakpoint with headless Chromium, into its __snapshots__/ folder (where
 * `eds block test` keeps its baselines). With --push they go on the draft's
 * branch too, for its pull request.
 */
export async function draftShot(
	name: string,
	options: { version?: string; push?: boolean; port?: string },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	const draft = await draftOrExit(root, name);
	if (!draft) return;
	const v =
		parseVersion(options.version) ?? draft.accepted?.version ?? draft.versions.at(-1)?.version;
	if (!v || !draft.versions.some((x) => x.version === v)) {
		logger.error(`Draft "${name}" has no version ${options.version ?? ""}.`.trim());
		process.exitCode = 1;
		return;
	}
	const dir = versionDir(root, name, v);
	const { startBlockFrameServer } = await import("./block/preview.js");
	const { screenshotRoute } = await import("../lib/preview/visual.js");
	const port = Number.parseInt(options.port ?? "8789", 10);
	const files: string[] = [];
	const widths: number[] = [];
	try {
		const { server, frame, block } = await startBlockFrameServer(
			root,
			name,
			dir,
			Number.isFinite(port) ? port : 8789,
		);
		try {
			await mkdir(path.join(dir, "__snapshots__"), { recursive: true });
			for (const bp of block.breakpoints) {
				const shot = await screenshotRoute(
					`${server.url}${frame.slice(1)}`,
					bp.width,
					`.${name}-wrapper > .${name}`,
				);
				const rel = `__snapshots__/${name}-${bp.width}.png`;
				await writeFile(path.join(dir, rel), shot);
				files.push(rel);
				widths.push(bp.width);
				logger.success(`v${v} at ${bp.width}px → ${rel}`);
			}
		} finally {
			await server.close();
		}
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	events.emit({ type: "shots", name, version: v, files, widths });
	if (options.push) {
		const { pushVersion } = await import("../lib/draft-branch.js");
		try {
			const r = await pushVersion(root, name, v, `${name}: screenshots of v${v}`);
			events.emit({ type: "pushed", name, version: v, ...r });
			logger.success(`Pushed the screenshots to ${r.branch}.`);
		} catch (err) {
			const e = err as { stderr?: string; message: string };
			logger.error(`Couldn't push: ${(e.stderr || e.message).trim().split("\n").pop()}`);
			process.exitCode = 1;
		}
	}
}

/** `eds draft push <name> [version]` */
export async function draftPushCommand(name: string, options: { version?: string }): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	const draft = await draftOrExit(root, name);
	if (!draft) return;
	const v = parseVersion(options.version) ?? draft.versions.at(-1)?.version;
	if (!v || !draft.versions.some((x) => x.version === v)) {
		logger.error(`Draft "${name}" has no version ${options.version ?? ""}.`.trim());
		process.exitCode = 1;
		return;
	}
	await pushDraft(root, name, v);
}

/** `eds draft discard <name>` */
export async function draftDiscard(name: string): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	if (await discardDraft(root, name)) {
		events.emit({ type: "discarded", name });
		logger.success(`Discarded draft "${name}". blocks/ is unchanged.`);
	} else {
		logger.error(`No draft "${name}".`);
		process.exitCode = 1;
	}
}
