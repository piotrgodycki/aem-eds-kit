import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { detectAgent } from "../lib/agents/detect.js";
import { invokeAgent, savePromptToFile } from "../lib/agents/invoke.js";
import { isLocalAgent } from "../lib/agents/local.js";
import { loadConfig } from "../lib/config.js";
import {
	acceptDraft,
	acceptMessage,
	discardDraft,
	listDrafts,
	readDraft,
	recordCommit,
	versionDir,
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
	options: { agent?: string; model?: string; version?: string },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	const draft = await draftOrExit(root, name);
	if (!draft) return;
	if (!feedback?.trim()) {
		logger.error('Say what to change: eds draft refine <name> "<what to change>"');
		process.exitCode = 1;
		return;
	}
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
	options: { version?: string; commit?: boolean; branch?: string },
): Promise<void> {
	const root = projectOrExit();
	if (!root) return;
	if (!(await draftOrExit(root, name))) return;
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
