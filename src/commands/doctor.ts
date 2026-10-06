import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { globalConfigExists } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { detectProject, findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";
import type { DoctorCheckResult } from "../types/index.js";

interface DoctorOptions {
	json?: boolean;
}

export async function doctor(options: DoctorOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	const project = detectProject(projectRoot);
	if (!options.json) {
		logger.logoOnce(ui.logo("Doctor"));
		logger.info(ui.heading("Doctor", projectRoot));
	}

	const results: DoctorCheckResult[] = [];

	// Check fstab.yaml
	results.push({
		name: "fstab.yaml exists",
		status: project.hasFstab ? "pass" : "fail",
		message: project.hasFstab ? "Found" : "Missing — required for EDS projects",
	});

	// Check fstab.yaml is valid YAML
	if (project.hasFstab) {
		try {
			const content = await readFile(path.join(projectRoot, "fstab.yaml"), "utf-8");
			parseYaml(content);
			results.push({ name: "fstab.yaml valid YAML", status: "pass", message: "Valid" });
		} catch {
			results.push({
				name: "fstab.yaml valid YAML",
				status: "fail",
				message: "Invalid YAML syntax",
			});
		}
	}

	// Check head.html
	results.push({
		name: "head.html exists",
		status: project.hasHeadHtml ? "pass" : "warn",
		message: project.hasHeadHtml ? "Found" : "Missing — recommended for metadata/scripts",
	});

	// Check blocks directory
	results.push({
		name: "blocks/ directory",
		status: project.hasBlocks ? "pass" : "warn",
		message: project.hasBlocks ? "Found" : "Missing — no blocks yet",
	});

	// Check each block has a JS file
	if (project.hasBlocks) {
		const blocksDir = path.join(projectRoot, "blocks");
		const entries = await readdir(blocksDir, { withFileTypes: true });

		// An aggregated UE model file (if the project uses one) can hold models
		// for many blocks — read it once so per-block checks can look inside.
		let aggregatedModels = "";
		const aggregatedPath = path.join(projectRoot, "component-models.json");
		if (existsSync(aggregatedPath)) {
			try {
				aggregatedModels = await readFile(aggregatedPath, "utf-8");
			} catch {
				// ignore
			}
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const blockName = entry.name;
			const jsFile = path.join(blocksDir, blockName, `${blockName}.js`);
			const hasJs = existsSync(jsFile);
			results.push({
				name: `blocks/${blockName} has JS`,
				status: hasJs ? "pass" : "warn",
				message: hasJs ? "Found" : `Missing ${blockName}.js`,
			});

			// Check for console.log in block JS
			if (hasJs) {
				const jsContent = await readFile(jsFile, "utf-8");
				if (jsContent.includes("console.log")) {
					results.push({
						name: `blocks/${blockName} no console.log`,
						status: "warn",
						message: "Found console.log — remove before production",
					});
				}
			}

			// Check for a Universal Editor model (per-block or aggregated).
			const hasPerBlockModel = existsSync(path.join(blocksDir, blockName, `_${blockName}.json`));
			const hasAggregatedModel = aggregatedModels.includes(`"${blockName}"`);
			results.push({
				name: `blocks/${blockName} UE model`,
				status: hasPerBlockModel || hasAggregatedModel ? "pass" : "warn",
				message:
					hasPerBlockModel || hasAggregatedModel
						? hasPerBlockModel
							? `_${blockName}.json`
							: "in component-models.json"
						: "no Universal Editor model — authors can't edit this block in UE",
			});

			// Check .eds-meta.json freshness
			const metaFile = path.join(blocksDir, blockName, ".eds-meta.json");
			if (existsSync(metaFile)) {
				try {
					const meta = JSON.parse(await readFile(metaFile, "utf-8"));
					const syncDate = new Date(meta.lastSyncedAt);
					const daysSinceSync = Math.floor(
						(Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24),
					);
					results.push({
						name: `blocks/${blockName} Figma sync`,
						status: daysSinceSync > 30 ? "warn" : "pass",
						message:
							daysSinceSync > 30
								? `Last synced ${daysSinceSync} days ago — design may have changed`
								: `Synced ${daysSinceSync} days ago`,
					});
				} catch {
					results.push({
						name: `blocks/${blockName} .eds-meta.json`,
						status: "warn",
						message: "Invalid metadata file",
					});
				}
			}
		}
	}

	// Check helix-query.yaml if exists
	const queryFile = path.join(projectRoot, "helix-query.yaml");
	if (existsSync(queryFile)) {
		try {
			const content = await readFile(queryFile, "utf-8");
			parseYaml(content);
			results.push({ name: "helix-query.yaml valid", status: "pass", message: "Valid YAML" });
		} catch {
			results.push({
				name: "helix-query.yaml valid",
				status: "fail",
				message: "Invalid YAML syntax",
			});
		}
	}

	// Check eds config
	results.push({
		name: "~/.eds/config.json",
		status: globalConfigExists() ? "pass" : "warn",
		message: globalConfigExists() ? "Found" : 'Missing — run "eds figma setup" to configure',
	});

	const fails0 = results.filter((r) => r.status === "fail");
	const warns0 = results.filter((r) => r.status === "warn");

	if (options.json) {
		const summary = {
			pass: results.filter((r) => r.status === "pass").length,
			warn: warns0.length,
			fail: fails0.length,
		};
		console.log(JSON.stringify({ projectRoot, results, summary }, null, 2));
		if (fails0.length > 0) process.exitCode = 1;
		return;
	}

	// Print results — align names into a shared column.
	const nameWidth = ui.columnWidth(results.map((r) => r.name));
	for (const r of results) {
		logger.info(ui.statusLine(r.status, r.name, r.message, nameWidth));
	}

	const fails = results.filter((r) => r.status === "fail");
	const warns = results.filter((r) => r.status === "warn");
	const passes = results.filter((r) => r.status === "pass");

	logger.info("");
	logger.info(
		ui.box([ui.summary({ pass: passes.length, warn: warns.length, fail: fails.length })]),
	);
	if (fails.length > 0) process.exitCode = 1;
}
