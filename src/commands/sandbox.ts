import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import {
	BOILERPLATES,
	SANDBOX_TOPIC,
	codeSyncInstallUrl,
	createArgs,
	previewUrl,
} from "../lib/sandbox/github.js";
import * as ui from "../lib/ui.js";

export interface SandboxNewOptions {
	org?: string;
	boilerplate?: string;
	ue?: boolean;
	private?: boolean;
	/** Skip the guided prompts (use flags/defaults). */
	yes?: boolean;
}
export interface SandboxRmOptions {
	org?: string;
	yes?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: execa's type is imported dynamically
type Execa = any;

async function gh(args: string[], opts: Record<string, unknown> = {}): Promise<string> {
	const { execa }: Execa = await import("execa");
	const res = await execa("gh", args, opts);
	return (res.stdout ?? "").toString().trim();
}

/** Open a URL in the default browser (best-effort, cross-platform). */
async function openUrl(url: string): Promise<void> {
	const { execa }: Execa = await import("execa");
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		await execa(cmd, [url], { stdio: "ignore" });
	} catch {
		// non-fatal - the URL is printed anyway
	}
}

/** Verify `gh` is installed and authenticated; return the logged-in user. */
async function ensureGh(): Promise<string | null> {
	try {
		await gh(["--version"]);
	} catch {
		logger.error("GitHub CLI (gh) not found. Install it: https://cli.github.com");
		process.exitCode = 1;
		return null;
	}
	try {
		await gh(["auth", "status"]);
	} catch {
		logger.error("Not logged in to GitHub. Run `gh auth login` first.");
		process.exitCode = 1;
		return null;
	}
	try {
		return await gh(["api", "user", "-q", ".login"]);
	} catch {
		return null;
	}
}

/**
 * `eds sandbox new <name>` - spin up a disposable EDS repo on GitHub from a
 * boilerplate template, tagged so it's easy to find and tear down.
 */
export async function sandboxNew(name: string, options: SandboxNewOptions = {}): Promise<void> {
	const login = await ensureGh();
	if (login === null && !options.org) return;

	await logger.logoOnceAnimated("Sandbox");

	const interactive = !options.yes;
	const { select, confirm } = await import("@inquirer/prompts");

	// Which boilerplate?
	let template = options.boilerplate;
	if (!template) {
		if (options.ue) template = BOILERPLATES.ue;
		else if (interactive) {
			template = (await select({
				message: "Which boilerplate?",
				choices: [
					{ name: "Document Authoring (adobe/aem-boilerplate)", value: BOILERPLATES.document },
					{
						name: "Universal Editor / crosswalk (adobe/aem-boilerplate-xwalk)",
						value: BOILERPLATES.ue,
					},
				],
			})) as string;
		} else template = BOILERPLATES.document;
	}

	// Public or private?
	let priv = options.private ?? false;
	if (options.private === undefined && interactive) {
		priv = (await select({
			message: "Visibility?",
			choices: [
				{ name: "Public", value: false },
				{ name: "Private", value: true },
			],
			default: false,
		})) as boolean;
	}

	const owner = options.org ?? login ?? "";
	const repoRef = options.org ? `${options.org}/${name}` : name;

	logger.info(ui.heading("Creating sandbox", `${repoRef}  ·  ${template}`));
	try {
		const { execa }: Execa = await import("execa");
		await execa("gh", createArgs(repoRef, { template, private: priv, clone: true }), {
			stdio: "inherit",
		});
	} catch (err) {
		logger.error(`gh repo create failed: ${(err as Error).message}`);
		process.exitCode = 1;
		return;
	}

	// Tag it so `eds sandbox list` / teardown can find it (best-effort).
	try {
		await gh(["repo", "edit", `${owner}/${name}`, "--add-topic", SANDBOX_TOPIC]);
	} catch {
		// non-fatal
	}

	logger.info("");
	logger.info(ui.heading("Sandbox ready"));
	logger.info(ui.accentLine("repo", `https://github.com/${owner}/${name}`));
	logger.info(ui.accentLine("preview", previewUrl(owner, name)));
	logger.info("");

	// Guide the remaining moves.
	if (interactive) {
		if (await confirm({ message: "Open the AEM Code Sync install page now?", default: true })) {
			await openUrl(codeSyncInstallUrl());
		}
		if (
			await confirm({ message: `Configure authoring now (eds init in ./${name})?`, default: true })
		) {
			const prevCwd = process.cwd();
			try {
				process.chdir(path.join(prevCwd, name));
				const { initProject } = await import("./init.js");
				await initProject({});
			} finally {
				process.chdir(prevCwd);
			}
		}
	} else {
		logger.info(chalk.dim(`  Install AEM Code Sync: ${codeSyncInstallUrl()}`));
		logger.info(chalk.dim(`  Configure authoring: cd ${name} && eds init`));
	}
	logger.info("");
	logger.info(ui.box([`Sandbox "${name}" ready - tear down with \`eds sandbox rm ${name}\``]));
}

/** `eds sandbox list` - list sandboxes you created (tagged eds-sandbox). */
export async function sandboxList(): Promise<void> {
	const login = await ensureGh();
	if (login === null) return;

	let repos: { nameWithOwner: string; url: string }[] = [];
	try {
		const out = await gh([
			"repo",
			"list",
			"--topic",
			SANDBOX_TOPIC,
			"--limit",
			"100",
			"--json",
			"nameWithOwner,url",
		]);
		repos = out ? JSON.parse(out) : [];
	} catch (err) {
		logger.error(`gh repo list failed: ${(err as Error).message}`);
		process.exitCode = 1;
		return;
	}

	logger.info(ui.heading("Sandboxes", `${repos.length} tagged ${SANDBOX_TOPIC}`));
	if (repos.length === 0) {
		logger.info(chalk.dim("  None yet. Create one with `eds sandbox new <name>`."));
		return;
	}
	const w = ui.columnWidth(repos.map((r) => r.nameWithOwner));
	for (const r of repos) {
		const [o, n] = r.nameWithOwner.split("/");
		logger.info(ui.accentLine(r.nameWithOwner, previewUrl(o, n), w));
	}
}

/** `eds sandbox rm <name>` - delete a sandbox repo (destructive). */
export async function sandboxRm(name: string, options: SandboxRmOptions = {}): Promise<void> {
	const login = await ensureGh();
	if (login === null && !options.org) return;

	const owner = options.org ?? login ?? "";
	const repoRef = `${owner}/${name}`;

	if (!options.yes) {
		const { confirm } = await import("@inquirer/prompts");
		const go = await confirm({
			message: `Permanently delete ${repoRef}? This cannot be undone.`,
			default: false,
		});
		if (!go) {
			logger.info("Cancelled.");
			return;
		}
	}

	try {
		await gh(["repo", "delete", repoRef, "--yes"]);
	} catch (err) {
		logger.error(`gh repo delete failed: ${(err as Error).message}`);
		logger.info(
			chalk.dim("  Deleting repos needs the delete_repo scope: `gh auth refresh -s delete_repo`."),
		);
		process.exitCode = 1;
		return;
	}
	logger.info(ui.heading("Deleted"));
	logger.info(ui.accentLine(repoRef, "removed"));
}
