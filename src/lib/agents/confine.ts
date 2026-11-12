import type { AgentType } from "../../types/index.js";
import { canSandbox } from "./os-sandbox.js";

/**
 * Keeping an agent to the project folder. Claude Code's `--restricted` mode
 * (newer versions) confines its file tools to the working directory and drops
 * its shell. A local model never touches files: it sees what eds sends and eds
 * writes its answer. Codex has no such mode, so eds runs it in an OS sandbox
 * (macOS, Linux; see os-sandbox.ts). Cursor's `cursor` command hands the prompt to
 * the running Cursor app, outside any sandbox eds could set up.
 */

let claudeRestricted: Promise<boolean> | undefined;

/** Whether the installed Claude Code has `--restricted` (checked once per run). */
export function claudeCanConfine(): Promise<boolean> {
	claudeRestricted ??= import("execa")
		.then(({ execa }) => execa("claude", ["--help"]))
		.then((r) => /--restricted\b/.test(r.stdout))
		.catch(() => false);
	return claudeRestricted;
}

/** Whether runs with this agent stay inside the project folder. */
export async function confinedToProject(
	type: AgentType,
	canConfineClaude: () => Promise<boolean> = claudeCanConfine,
	sandbox: () => boolean = canSandbox,
): Promise<boolean> {
	if (type === "claude") return canConfineClaude();
	if (type === "codex") return sandbox();
	return type !== "cursor";
}

/** `EDS_CONFINED_ONLY=1`: refuse agents that could read outside the project. */
export function confinedOnly(): boolean {
	return process.env.EDS_CONFINED_ONLY === "1";
}
