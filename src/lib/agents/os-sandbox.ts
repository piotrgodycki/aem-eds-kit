import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * An OS sandbox for agents that have no confinement of their own (Codex): the
 * agent sees the project, its own settings folder and the system, but not the
 * rest of the user's home. macOS uses its built-in `sandbox-exec`, Linux
 * bubblewrap (`bwrap`); Windows has no equivalent, so there is no sandbox.
 */

interface SandboxOptions {
	/** The project folder: readable and writable. */
	project: string;
	/** Folders under home the agent needs for its sign-in and settings, e.g. `.codex`. */
	agentDirs: string[];
	/** The agent's executable, so its install folder stays readable if it lives in home. */
	binary?: string;
	home?: string;
	platform?: NodeJS.Platform;
	exists?: (file: string) => boolean;
}

interface SandboxedCommand {
	file: string;
	args: string[];
}

const BWRAP_PATHS = ["/usr/bin/bwrap", "/usr/local/bin/bwrap", "/bin/bwrap"];

/** Whether this machine can sandbox an agent. */
export function canSandbox(
	platform: NodeJS.Platform = process.platform,
	exists: (file: string) => boolean = existsSync,
): boolean {
	if (platform === "darwin") return exists("/usr/bin/sandbox-exec");
	if (platform === "linux") return BWRAP_PATHS.some(exists);
	return false;
}

/** `command args` run inside the sandbox, or null where the OS has none. */
export function sandboxed(
	command: string,
	args: string[],
	opts: SandboxOptions,
): SandboxedCommand | null {
	const platform = opts.platform ?? process.platform;
	const exists = opts.exists ?? existsSync;
	if (!canSandbox(platform, exists)) return null;
	// Sandboxes match real paths (on macOS /var is /private/var), so resolve links first.
	const home = real(opts.home ?? homedir());
	const writable = [real(opts.project), ...opts.agentDirs.map((d) => path.join(home, d))];
	const readable = toolDirs(home, [opts.binary, process.execPath]);
	if (platform === "darwin")
		return {
			file: "/usr/bin/sandbox-exec",
			args: ["-p", macProfile(home, writable, readable), command, ...args],
		};
	const bwrap = BWRAP_PATHS.find(exists) as string;
	return {
		file: bwrap,
		args: [
			"--dev-bind",
			"/",
			"/",
			// An empty home, then only what the agent needs is put back.
			"--tmpfs",
			home,
			...writable.filter(exists).flatMap((d) => ["--bind", d, d]),
			...readable.filter(exists).flatMap((d) => ["--ro-bind", d, d]),
			"--chdir",
			opts.project,
			"--die-with-parent",
			"--",
			command,
			...args,
		],
	};
}

function real(file: string): string {
	try {
		return realpathSync(file);
	} catch {
		return file;
	}
}

/**
 * The top-level home folders that hold the agent and Node (e.g. `~/.nvm`), so
 * a CLI installed in home still starts. Tool folders, not the user's files.
 */
function toolDirs(home: string, files: Array<string | undefined>): string[] {
	const dirs = new Set<string>();
	for (const file of files) {
		if (!file) continue;
		const rel = path.relative(home, real(file));
		if (rel && !rel.startsWith("..") && !path.isAbsolute(rel))
			dirs.add(path.join(home, rel.split(path.sep)[0]));
	}
	return [...dirs];
}

/** A sandbox-exec profile: everything allowed, except home and other volumes, but these folders. */
function macProfile(home: string, writable: string[], readable: string[]): string {
	const q = (p: string) => `"${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	const subpaths = (list: string[]) => list.map((p) => `(subpath ${q(p)})`).join(" ");
	// Resolving a path stats every folder on the way, so those stay visible (names only).
	const ancestors = new Set<string>();
	for (const dir of [...writable, ...readable])
		for (let d = path.dirname(dir); d !== path.dirname(d); d = path.dirname(d)) ancestors.add(d);
	const literals = [...ancestors].map((d) => `(literal ${q(d)})`).join(" ");
	return [
		"(version 1)",
		"(allow default)",
		`(deny file-read* file-write* (subpath ${q(home)}) (subpath "/Volumes"))`,
		...(literals ? [`(allow file-read-metadata ${literals})`] : []),
		`(allow file-read* file-write* ${subpaths(writable)})`,
		...(readable.length ? [`(allow file-read* ${subpaths(readable)})`] : []),
	].join("\n");
}
