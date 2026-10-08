import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import {
	addTopics,
	createFromTemplate,
	deleteRepo,
	getUser,
	repoExists,
	searchByTopic,
} from "../lib/sandbox/api.js";
import {
	CLIENT_ID,
	clearToken,
	getToken,
	pollDeviceToken,
	saveToken,
	startDeviceFlow,
} from "../lib/sandbox/auth.js";
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
	yes?: boolean;
}
export interface SandboxRmOptions {
	org?: string;
	yes?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: execa is imported dynamically
type Execa = any;

async function run(
	cmd: string,
	args: string[],
	opts: Record<string, unknown> = {},
): Promise<string> {
	const { execa }: Execa = await import("execa");
	const res = await execa(cmd, args, opts);
	return (res.stdout ?? "").toString().trim();
}

async function openUrl(url: string): Promise<void> {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		await run(cmd, [url], { stdio: "ignore" });
	} catch {
		// non-fatal - the URL is printed anyway
	}
}

type Auth = { mode: "api"; token: string; login: string } | { mode: "gh"; login: string };

async function ghLogin(): Promise<string | null> {
	try {
		await run("gh", ["auth", "status"]);
		return await run("gh", ["api", "user", "-q", ".login"]);
	} catch {
		return null;
	}
}

/** Prefer a GitHub token (our own auth); fall back to an authenticated `gh`. */
async function resolveAuth(): Promise<Auth | null> {
	const token = await getToken();
	if (token) {
		try {
			return { mode: "api", token, login: await getUser(token) };
		} catch {
			// bad/expired token - try gh
		}
	}
	const login = await ghLogin();
	if (login) return { mode: "gh", login };
	return null;
}

/** True if `owner/name` already exists, so we never create over an existing repo. */
async function exists(auth: Auth, owner: string, name: string): Promise<boolean> {
	if (auth.mode === "api") return repoExists(auth.token, owner, name);
	try {
		await run("gh", ["repo", "view", `${owner}/${name}`, "--json", "name"]);
		return true;
	} catch {
		return false;
	}
}

function noAuth(): void {
	logger.error("Not authenticated with GitHub.");
	logger.info("  Run `eds sandbox login` to authorize GitHub, or install + `gh auth login`.");
	process.exitCode = 1;
}

/** `eds sandbox login` - authorize GitHub via Device Flow, or store a token. */
export async function sandboxLogin(): Promise<void> {
	await logger.logoOnceAnimated("Sandbox - GitHub login");
	const { input } = await import("@inquirer/prompts");

	if (CLIENT_ID) {
		const code = await startDeviceFlow(["repo", "delete_repo"]);
		logger.info(ui.heading("Authorize GitHub"));
		logger.info(ui.accentLine("code", code.user_code));
		logger.info(ui.accentLine("open", code.verification_uri));
		logger.info("");
		await openUrl(code.verification_uri);
		logger.info(chalk.dim("  Waiting for you to authorize in the browser..."));
		try {
			const token = await pollDeviceToken(code.device_code, code.interval, code.expires_in);
			await saveToken(token);
			logger.success(`Authorized as ${await getUser(token)}.`);
		} catch (err) {
			logger.error(`Device flow failed: ${(err as Error).message}`);
			process.exitCode = 1;
		}
		return;
	}

	// No OAuth app configured - accept a least-privilege fine-grained token.
	logger.info(ui.heading("Authorize GitHub (least-privilege token)"));
	logger.info("  Create a fine-grained token limited to your sandboxes only:");
	logger.info(`  ${chalk.cyan("https://github.com/settings/personal-access-tokens/new")}`);
	logger.info(
		chalk.dim("  - Resource owner: a dedicated sandbox org (recommended) or your account"),
	);
	logger.info(
		chalk.dim("  - Repository access: All repositories in that org (to create new sandboxes),"),
	);
	logger.info(chalk.dim("    or Only select repositories to manage existing ones"));
	logger.info(
		chalk.dim("  - Permissions: Administration = Read and write, Contents = Read and write,"),
	);
	logger.info(chalk.dim("    Metadata = Read. Set a short expiry."));
	logger.info(
		chalk.dim(
			"  Tip: `eds sandbox new --org <sandbox-org>` so nothing in your personal account is touched.",
		),
	);
	logger.info("");
	if (
		await (await import("@inquirer/prompts")).confirm({
			message: "Open the token page?",
			default: true,
		})
	) {
		await openUrl("https://github.com/settings/personal-access-tokens/new");
	}
	const token = (
		await input({ message: "Paste the token", validate: (v) => !!v.trim() || "Required" })
	).trim();
	try {
		const login = await getUser(token);
		await saveToken(token);
		logger.success(`Authorized as ${login}.`);
	} catch {
		logger.error("That token didn't work (check the scopes).");
		process.exitCode = 1;
	}
}

export async function sandboxLogout(): Promise<void> {
	await clearToken();
	logger.success("Signed out (stored GitHub token removed).");
}

/** `eds sandbox new <name>` - spin up a disposable EDS repo from a boilerplate. */
export async function sandboxNew(name: string, options: SandboxNewOptions = {}): Promise<void> {
	const auth = await resolveAuth();
	if (!auth) return noAuth();

	await logger.logoOnceAnimated("Sandbox");
	const interactive = !options.yes;
	const { select, confirm } = await import("@inquirer/prompts");

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

	const owner = options.org ?? auth.login;

	// Never create over an existing repo. Refuse up front with a clear message.
	if (await exists(auth, owner, name)) {
		logger.error(`A repository ${owner}/${name} already exists - refusing to touch it.`);
		logger.info(
			chalk.dim("  Pick another name, or remove it first (e.g. `eds sandbox rm` for a sandbox)."),
		);
		process.exitCode = 1;
		return;
	}

	logger.info(ui.heading("Creating sandbox", `${owner}/${name}  ·  ${template}`));
	try {
		if (auth.mode === "api") {
			const repo = await createFromTemplate(auth.token, template, { owner, name, private: priv });
			await addTopics(auth.token, owner, name, [SANDBOX_TOPIC]);
			logger.info(chalk.dim("  Cloning..."));
			await run("git", ["clone", repo.cloneUrl, name], { stdio: "inherit" });
		} else {
			const repoRef = options.org ? `${options.org}/${name}` : name;
			await run("gh", createArgs(repoRef, { template, private: priv, clone: true }), {
				stdio: "inherit",
			});
			try {
				await run("gh", ["repo", "edit", `${owner}/${name}`, "--add-topic", SANDBOX_TOPIC]);
			} catch {
				// non-fatal
			}
		}
	} catch (err) {
		logger.error(`Create failed: ${(err as Error).message}`);
		process.exitCode = 1;
		return;
	}

	logger.info("");
	logger.info(ui.heading("Sandbox ready"));
	logger.info(ui.accentLine("repo", `https://github.com/${owner}/${name}`));
	logger.info(ui.accentLine("preview", previewUrl(owner, name)));
	logger.info("");

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

/** `eds sandbox list` - list your sandboxes (tagged eds-sandbox). */
export async function sandboxList(): Promise<void> {
	const auth = await resolveAuth();
	if (!auth) return noAuth();

	let names: string[] = [];
	try {
		if (auth.mode === "api") {
			names = await searchByTopic(auth.token, auth.login, SANDBOX_TOPIC);
		} else {
			const out = await run("gh", [
				"repo",
				"list",
				"--topic",
				SANDBOX_TOPIC,
				"--limit",
				"100",
				"--json",
				"nameWithOwner",
				"-q",
				".[].nameWithOwner",
			]);
			names = out ? out.split("\n").filter(Boolean) : [];
		}
	} catch (err) {
		logger.error(`List failed: ${(err as Error).message}`);
		process.exitCode = 1;
		return;
	}

	logger.info(ui.heading("Sandboxes", `${names.length} tagged ${SANDBOX_TOPIC}`));
	if (names.length === 0) {
		logger.info(chalk.dim("  None yet. Create one with `eds sandbox new <name>`."));
		return;
	}
	const w = ui.columnWidth(names);
	for (const full of names) {
		const [o, n] = full.split("/");
		logger.info(ui.accentLine(full, previewUrl(o, n), w));
	}
}

/** `eds sandbox rm <name>` - delete a sandbox repo (destructive). */
export async function sandboxRm(name: string, options: SandboxRmOptions = {}): Promise<void> {
	const auth = await resolveAuth();
	if (!auth) return noAuth();

	const owner = options.org ?? auth.login;
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
		if (auth.mode === "api") await deleteRepo(auth.token, owner, name);
		else await run("gh", ["repo", "delete", repoRef, "--yes"]);
	} catch (err) {
		logger.error(`Delete failed: ${(err as Error).message}`);
		logger.info(
			chalk.dim(
				"  Deleting needs the delete_repo scope (re-run `eds sandbox login`, or `gh auth refresh -s delete_repo`).",
			),
		);
		process.exitCode = 1;
		return;
	}
	logger.info(ui.heading("Deleted"));
	logger.info(ui.accentLine(repoRef, "removed"));
}
