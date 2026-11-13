/**
 * The project's own linters on a block the agent wrote. The agent may not run
 * commands, so its CSS and JS can break rules the project's CI enforces (e.g.
 * stylelint's alpha-value-notation). The kit runs the project's stylelint and
 * eslint from node_modules/.bin (no npm or pnpm involved) with --fix first, then
 * again to see what is left. A project without them, or without their config,
 * is skipped.
 */

import { existsSync } from "node:fs";
import path from "node:path";

interface LintResult {
	tool: "stylelint" | "eslint";
	ok: boolean;
	/** What the linter printed when problems were left, trimmed. */
	output: string;
}

const bin = (root: string, tool: string) =>
	path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${tool}.cmd` : tool);

/** Signs that the linter had nothing to check against, rather than found problems. */
const NO_CONFIG =
	/No configuration provided|couldn't find a configuration file|No ESLint configuration/i;

async function run(root: string, tool: "stylelint" | "eslint", files: string[]) {
	const { execa } = await import("execa");
	const exe = bin(root, tool);
	if (!files.length || !existsSync(exe)) return null;
	const opts = { cwd: root, reject: false, timeout: 60_000, all: true } as const;
	await execa(exe, ["--fix", ...files], opts);
	const r = await execa(exe, files, opts);
	const output = String(r.all ?? "").trim();
	if (r.exitCode !== 0 && NO_CONFIG.test(output)) return null;
	return { tool, ok: r.exitCode === 0, output: output.slice(0, 2000) } satisfies LintResult;
}

/** Lint (and fix) a block's files with the project's own stylelint and eslint. */
export async function lintBlock(
	root: string,
	blockDir: string,
	files: string[],
): Promise<LintResult[]> {
	const rel = (f: string) => path.relative(root, path.join(blockDir, f));
	const css = files.filter((f) => f.endsWith(".css")).map(rel);
	const js = files.filter((f) => /\.(m?js|json)$/.test(f)).map(rel);
	const results = await Promise.all([run(root, "stylelint", css), run(root, "eslint", js)]);
	return results.filter((r): r is LintResult => r !== null);
}
