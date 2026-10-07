import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { writeCiWorkflow } from "../lib/scaffold/ci.js";
import {
	AUTHORING_NAMES,
	type Authoring,
	daMountpoint,
	needsFstab,
	writeFstab,
	writePaths,
} from "../lib/scaffold/fstab.js";
import * as ui from "../lib/ui.js";
import { scaffoldUe } from "./scaffold.js";

export interface InitOptions {
	name?: string;
	authoring?: Authoring;
	mountpoint?: string;
	org?: string;
	site?: string;
	/** Scaffold the CI workflow. Defaults to true. */
	ci?: boolean;
	/** Skip prompts; apply with provided flags/defaults. */
	yes?: boolean;
}

const slug = (s: string): string =>
	s
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");

async function setPackageName(root: string, name: string): Promise<boolean> {
	const file = path.join(root, "package.json");
	if (!existsSync(file)) return false;
	try {
		const pkg = JSON.parse(await readFile(file, "utf-8"));
		pkg.name = name;
		await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
		return true;
	} catch {
		return false;
	}
}

/** Swap the boilerplate's name token in a few human-facing files. */
async function replacePlaceholders(root: string, name: string): Promise<string[]> {
	const touched: string[] = [];
	for (const rel of ["README.md", "index.html", "head.html"]) {
		const file = path.join(root, rel);
		if (!existsSync(file)) continue;
		try {
			const before = await readFile(file, "utf-8");
			const after = before.replace(/aem-boilerplate/gi, name);
			if (after !== before) {
				await writeFile(file, after);
				touched.push(rel);
			}
		} catch {
			// ignore unreadable files
		}
	}
	return touched;
}

/** Interactive checklist of the steps only the developer can do (outside the repo). */
async function externalSteps(authoring: Authoring): Promise<void> {
	const { confirm } = await import("@inquirer/prompts");
	const steps: { title: string; url?: string; note: string }[] = [
		{
			title: "Install the AEM Code Sync GitHub app",
			url: "https://github.com/apps/aem-code-sync/installations/new",
			note: "Connects your repo to the Edge Delivery pipeline (preview/publish).",
		},
	];
	if (authoring === "gdrive") {
		steps.push({
			title: "Share your content folder",
			note: "Share the Google Drive folder with the AEM service and set it as the mountpoint.",
		});
	}
	if (authoring === "sharepoint") {
		steps.push({
			title: "Share your content folder",
			note: "Grant the SharePoint/OneDrive folder to the AEM service account.",
		});
	}
	if (authoring === "da") {
		steps.push({
			title: "Author in DA",
			url: "https://da.live",
			note: "Create documents at da.live.",
		});
	}
	if (authoring === "ue") {
		steps.push({
			title: "Open the Universal Editor",
			url: "https://experience.adobe.com",
			note: "Author in-context once the repo is connected to AEM.",
		});
	}
	steps.push({
		title: "Install the AEM Sidekick extension",
		url: "https://chromewebstore.google.com/detail/aem-sidekick/igkmdomcgoebiipaifhmpfjhbjccggml",
		note: "Preview and publish from the browser.",
	});
	steps.push({
		title: "Run the local dev server",
		note: "npm install, then `aem up` (from @adobe/aem-cli).",
	});

	logger.info(ui.heading("Next steps (outside the repo)"));
	for (let i = 0; i < steps.length; i++) {
		const s = steps[i];
		logger.info(`  ${ui.brand.accent(String(i + 1))}  ${chalk.bold(s.title)}`);
		if (s.url) logger.info(`     ${chalk.cyan(s.url)}`);
		logger.info(`     ${chalk.dim(s.note)}`);
		await confirm({ message: "     Done / skip?", default: true });
	}
}

/**
 * `eds init` - adapt a freshly cloned EDS boilerplate to a chosen authoring
 * model (Universal Editor / DA / Google Drive / SharePoint). Interactive
 * wizard when flags are omitted. Writes fstab only when the model needs it.
 */
export async function initProject(options: InitOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error(
			"Not inside an EDS project (no EDS project markers found). Clone an EDS boilerplate first, then run this from its root.",
		);
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Project setup");

	const { input, select, confirm } = await import("@inquirer/prompts");
	const interactive = !options.yes;

	// 1/4 - project name (default from package.json or the folder).
	let defaultName = path.basename(projectRoot);
	const pkgFile = path.join(projectRoot, "package.json");
	if (existsSync(pkgFile)) {
		try {
			defaultName = JSON.parse(await readFile(pkgFile, "utf-8")).name || defaultName;
		} catch {
			// ignore
		}
	}
	const name =
		(options.name && slug(options.name)) ||
		slug(
			await input({
				message: "1/4  Project name",
				default: slug(defaultName),
				validate: (v) => !!slug(v) || "Use letters, numbers and dashes",
			}),
		);

	// 2/4 - authoring model.
	const authoring =
		options.authoring ??
		((await select({
			message: "2/4  Authoring model",
			choices: [
				{ name: AUTHORING_NAMES.ue, value: "ue" },
				{ name: AUTHORING_NAMES.da, value: "da" },
				{ name: AUTHORING_NAMES.gdrive, value: "gdrive" },
				{ name: AUTHORING_NAMES.sharepoint, value: "sharepoint" },
			],
		})) as Authoring);

	// 3/4 - content mountpoint, only when the model needs an fstab. Build it from
	// flags when given (so --yes works), otherwise prompt.
	let mountpoint = options.mountpoint;
	if (needsFstab(authoring) && !mountpoint) {
		if (authoring === "da" && (options.org || interactive)) {
			const org =
				options.org ??
				(await input({ message: "     DA org", validate: (v) => !!v.trim() || "Required" }));
			const site =
				options.site ??
				(interactive ? await input({ message: "     DA site", default: name }) : name);
			mountpoint = daMountpoint(org.trim(), slug(site));
		} else if (authoring !== "da" && interactive) {
			const label = authoring === "gdrive" ? "Google Drive folder URL" : "SharePoint folder URL";
			mountpoint = (
				await input({
					message: `     ${label}`,
					validate: (v) => /^https?:\/\//.test(v.trim()) || "Paste the folder URL",
				})
			).trim();
		}
	}

	// 4/4 - CI gatekeeper.
	const withCi =
		options.ci ??
		(interactive
			? await confirm({ message: "4/4  Add GitHub Actions CI (audits gatekeeper)?", default: true })
			: true);

	// Summary + confirm.
	logger.info(ui.heading("Summary"));
	const w = ui.columnWidth(["name", "authoring", "mountpoint", "ci"]);
	logger.info(ui.accentLine("name", name, w));
	logger.info(ui.accentLine("authoring", AUTHORING_NAMES[authoring], w));
	if (mountpoint) logger.info(ui.accentLine("mountpoint", mountpoint, w));
	else if (needsFstab(authoring))
		logger.info(ui.accentLine("mountpoint", "(skipped - set it in fstab.yaml later)", w));
	logger.info(ui.accentLine("ci", withCi ? "yes" : "no", w));
	logger.info("");
	if (interactive) {
		const go = await confirm({ message: "Apply this setup?", default: true });
		if (!go) {
			logger.info("Cancelled.");
			return;
		}
	}

	// Apply.
	const done: string[] = [];
	if (await setPackageName(projectRoot, name)) done.push("package.json (name)");
	for (const t of await replacePlaceholders(projectRoot, name)) done.push(`${t} (renamed)`);
	if (needsFstab(authoring) && mountpoint) done.push(await writeFstab(projectRoot, mountpoint));
	if (authoring === "ue") {
		await scaffoldUe();
		done.push(await writePaths(projectRoot, name));
	}
	if (withCi) {
		const ci = await writeCiWorkflow(projectRoot);
		done.push(ci.created ? ci.path : `${ci.path} (exists, skipped)`);
	}

	logger.info(ui.heading("Configured"));
	const dw = ui.columnWidth(done.map((d) => d.split(" ")[0]));
	for (const d of done) {
		const [n, ...rest] = d.split(" ");
		logger.info(ui.accentLine(n, rest.join(" ").replace(/^\((.*)\)$/, "$1"), dw));
	}
	logger.info("");

	if (interactive) await externalSteps(authoring);

	logger.info(ui.box([`"${name}" set up for ${AUTHORING_NAMES[authoring]}`]));
}
