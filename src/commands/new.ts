import path from "node:path";
import chalk from "chalk";
import {
	COMMERCE_BOILERPLATE,
	cloneBoilerplate,
	isEmptyDir,
	resolveBoilerplate,
} from "../lib/boilerplate.js";
import { logger } from "../lib/logger.js";
import { BOILERPLATES } from "../lib/sandbox/github.js";
import * as ui from "../lib/ui.js";

export interface NewOptions {
	boilerplate?: string;
	ue?: boolean;
	ref?: string;
	keepHistory?: boolean;
	remote?: string;
	install?: boolean;
	yes?: boolean;
}

/**
 * `eds new [dir]` - clone the current EDS boilerplate into a local folder
 * (no GitHub auth, nothing created on GitHub), then optionally install
 * dependencies and run `eds init` in it.
 */
export async function newProject(dir: string | undefined, options: NewOptions = {}): Promise<void> {
	await logger.logoOnceAnimated("New project");
	const interactive = !options.yes;
	const { input, select, confirm } = await import("../lib/prompts.js");

	let target = dir?.trim();
	if (!target) {
		if (!interactive) {
			logger.error("Pass a folder: `eds new <dir>`.");
			process.exitCode = 1;
			return;
		}
		target = (
			await input({
				message: "Folder for the new project",
				default: "my-eds-site",
				validate: (v) => !!v.trim() || "Required",
			})
		).trim();
	}

	let choice = options.boilerplate;
	if (!choice && !options.ue && interactive) {
		choice = (await select({
			message: "Which boilerplate?",
			choices: [
				{
					name: `Document Authoring / DA (${BOILERPLATES.document})`,
					value: BOILERPLATES.document,
				},
				{ name: `Universal Editor / crosswalk (${BOILERPLATES.ue})`, value: BOILERPLATES.ue },
				{
					name: `Adobe Commerce storefront (${COMMERCE_BOILERPLATE})`,
					value: COMMERCE_BOILERPLATE,
				},
			],
		})) as string;
	}
	const bp = resolveBoilerplate(choice, options.ue);

	const abs = path.resolve(target);
	if (!(await isEmptyDir(abs))) {
		logger.error(`${target} already exists and isn't empty - refusing to clone into it.`);
		process.exitCode = 1;
		return;
	}

	logger.info(
		ui.heading("Cloning", `${bp.label}${options.ref ? `@${options.ref}` : ""}  →  ${target}`),
	);
	let result: Awaited<ReturnType<typeof cloneBoilerplate>>;
	try {
		result = await cloneBoilerplate(bp, abs, {
			ref: options.ref,
			keepHistory: options.keepHistory,
			remote: options.remote,
			stdio: interactive ? "inherit" : "pipe",
		});
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}

	const w = ui.columnWidth(["folder", "source", "history", "origin"]);
	logger.info(ui.heading("Project ready"));
	logger.info(ui.accentLine("folder", abs, w));
	logger.info(ui.accentLine("source", `${bp.label} @ ${result.commit.slice(0, 7)}`, w));
	logger.info(
		ui.accentLine(
			"history",
			options.keepHistory
				? "boilerplate history kept (remote: upstream)"
				: result.uncommitted
					? "fresh, files staged (set git user.name / user.email, then commit)"
					: "fresh (one initial commit)",
			w,
		),
	);
	logger.info(
		ui.accentLine("origin", options.remote ?? "not set (git remote add origin <url>)", w),
	);
	logger.info("");

	const install =
		options.install ??
		(interactive
			? await confirm({ message: "Install dependencies (npm install)?", default: true })
			: false);
	if (install) {
		try {
			const { execa } = await import("execa");
			await execa("npm", ["install"], { cwd: abs, stdio: interactive ? "inherit" : "pipe" });
			logger.success("Dependencies installed.");
		} catch (err) {
			logger.warn(`npm install failed: ${(err as Error).message.split("\n")[0]}`);
		}
	}

	if (
		interactive &&
		(await confirm({ message: `Configure authoring now (eds init in ${target})?`, default: true }))
	) {
		const prev = process.cwd();
		try {
			process.chdir(abs);
			const { initProject } = await import("./init.js");
			await initProject({ name: path.basename(abs), ...(bp.ue ? { authoring: "ue" } : {}) });
		} finally {
			process.chdir(prev);
		}
		return;
	}

	logger.info(chalk.dim(`  Next: cd ${target} && eds init`));
	logger.info(
		chalk.dim(
			"  Then push it to your own GitHub repo and install AEM Code Sync to get a preview URL.",
		),
	);
}
