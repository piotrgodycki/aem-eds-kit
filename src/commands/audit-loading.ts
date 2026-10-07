import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

interface AuditResult {
	rule: string;
	status: "pass" | "warn" | "fail" | "info";
	message: string;
	file?: string;
	line?: number;
}

const LCP_BUDGET_KB = 100;

interface AuditLoadingOptions {
	json?: boolean;
}

export async function auditLoading(options: AuditLoadingOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	if (!options.json) {
		logger.logoOnce(ui.logo("Loading Audit"));
		logger.info(ui.heading("Loading Order Audit", projectRoot));
	}

	const results: AuditResult[] = [];

	await checkHeadHtml(projectRoot, results);
	await checkScriptsJs(projectRoot, results);
	await checkStylesCss(projectRoot, results);
	await checkDelayedJs(projectRoot, results);
	await checkBlocks(projectRoot, results);
	await checkAemJs(projectRoot, results);

	if (options.json) {
		const summary = {
			pass: results.filter((r) => r.status === "pass").length,
			warn: results.filter((r) => r.status === "warn").length,
			fail: results.filter((r) => r.status === "fail").length,
			info: results.filter((r) => r.status === "info").length,
		};
		console.log(JSON.stringify({ projectRoot, results, summary }, null, 2));
		if (summary.fail > 0) process.exitCode = 1;
		return;
	}

	printResults(results);
}

// ── head.html ──────────────────────────────────────────────

async function checkHeadHtml(root: string, results: AuditResult[]) {
	const filePath = path.join(root, "head.html");
	if (!existsSync(filePath)) {
		results.push({
			rule: "head.html exists",
			status: "warn",
			message: "Missing head.html",
		});
		return;
	}

	const content = await readFile(filePath, "utf-8");
	const lines = content.split("\n");

	// Check for render-blocking scripts (not type="module")
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (
			/<script\b/i.test(line) &&
			!/type\s*=\s*["']module["']/i.test(line) &&
			!/<\/script>/.test(line)
		) {
			results.push({
				rule: "No render-blocking scripts in head.html",
				status: "fail",
				message: 'Script without type="module" blocks rendering',
				file: "head.html",
				line: i + 1,
			});
		}
	}

	// Check for extra stylesheets beyond styles.css
	const stylesheetMatches = content.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [];
	const extraStylesheets = stylesheetMatches.filter(
		(tag) => !tag.includes("styles/styles.css") && !tag.includes("styles.css"),
	);
	if (extraStylesheets.length > 0) {
		results.push({
			rule: "No extra stylesheets in head.html",
			status: "warn",
			message: `${extraStylesheets.length} extra stylesheet(s) — each competes with LCP budget`,
			file: "head.html",
		});
	}

	// Check for preload/preconnect (Adobe says these hurt EDS performance)
	if (/<link[^>]+rel=["'](preload|preconnect)["']/i.test(content)) {
		results.push({
			rule: "No preload/preconnect in head.html",
			status: "warn",
			message: "preload/preconnect can hurt EDS LCP — resources compete with the 100KB budget",
			file: "head.html",
		});
	}

	// Check for inline scripts
	if (/<script\b[^>]*>[\s\S]*?[^\s<][\s\S]*?<\/script>/i.test(content)) {
		results.push({
			rule: "No inline scripts in head.html",
			status: "warn",
			message: "Inline scripts block rendering — move to delayed.js",
			file: "head.html",
		});
	}

	// Check for third-party origins in script/link tags
	const thirdPartyPattern =
		/(?:src|href)=["'](https?:\/\/(?!(?:localhost|127\.0\.0\.1))[^"']+)["']/gi;
	for (const match of content.matchAll(thirdPartyPattern)) {
		const url = match[1];
		// Allow common CDN for fonts metadata but warn about scripts
		if (!url.includes("fonts.googleapis.com")) {
			results.push({
				rule: "No third-party resources in head.html",
				status: "warn",
				message: `Third-party resource: ${url} — move to delayed.js`,
				file: "head.html",
			});
		}
	}

	// Check for font preloads
	if (/<link[^>]+as=["']font["']/i.test(content)) {
		results.push({
			rule: "No font preloads in head.html",
			status: "warn",
			message: "Font preloads consume LCP bandwidth budget — let loadFonts() handle them",
			file: "head.html",
		});
	}

	if (!results.some((r) => r.file === "head.html")) {
		results.push({
			rule: "head.html is clean",
			status: "pass",
			message: "No render-blocking issues found",
			file: "head.html",
		});
	}
}

// ── scripts.js ─────────────────────────────────────────────

async function checkScriptsJs(root: string, results: AuditResult[]) {
	const filePath = path.join(root, "scripts", "scripts.js");
	if (!existsSync(filePath)) {
		results.push({
			rule: "scripts/scripts.js exists",
			status: "warn",
			message: "Missing scripts.js — cannot audit loading phases",
		});
		return;
	}

	const content = await readFile(filePath, "utf-8");
	const lines = content.split("\n");

	// Check three-phase structure
	const hasLoadEager = /function\s+loadEager|loadEager\s*=/i.test(content);
	const hasLoadLazy = /function\s+loadLazy|loadLazy\s*=/i.test(content);
	const hasLoadDelayed = /function\s+loadDelayed|loadDelayed\s*=/i.test(content);

	results.push({
		rule: "loadEager phase exists",
		status: hasLoadEager ? "pass" : "fail",
		message: hasLoadEager ? "Found" : "Missing loadEager — LCP optimization depends on it",
		file: "scripts/scripts.js",
	});

	results.push({
		rule: "loadLazy phase exists",
		status: hasLoadLazy ? "pass" : "fail",
		message: hasLoadLazy ? "Found" : "Missing loadLazy — below-fold content won't load properly",
		file: "scripts/scripts.js",
	});

	results.push({
		rule: "loadDelayed phase exists",
		status: hasLoadDelayed ? "pass" : "warn",
		message: hasLoadDelayed ? "Found" : "Missing loadDelayed — third-party scripts may block LCP",
		file: "scripts/scripts.js",
	});

	// Check delayed uses setTimeout with >=3000ms
	const delayedTimeoutMatch = content.match(/setTimeout\s*\([^,]+,\s*(\d+)\s*\)/);
	if (hasLoadDelayed && delayedTimeoutMatch) {
		const delay = Number.parseInt(delayedTimeoutMatch[1], 10);
		if (delay < 3000) {
			results.push({
				rule: "Delayed phase waits >= 3s",
				status: "warn",
				message: `delayed.js loads after ${delay}ms — should be >= 3000ms for LCP safety`,
				file: "scripts/scripts.js",
			});
		} else {
			results.push({
				rule: "Delayed phase waits >= 3s",
				status: "pass",
				message: `${delay}ms delay before loading delayed.js`,
				file: "scripts/scripts.js",
			});
		}
	}

	// Check that loadEager only loads first section
	if (hasLoadEager) {
		const eagerSection = content.match(/loadEager[\s\S]*?(?=function\s|const\s+load|$)/)?.[0] || "";
		if (/loadSections\s*\(/.test(eagerSection)) {
			results.push({
				rule: "loadEager loads only first section",
				status: "fail",
				message: "loadEager calls loadSections() — should only load first section for fast LCP",
				file: "scripts/scripts.js",
			});
		}
	}

	// Check for third-party imports in top-level / eager phase
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/import\s.*from\s+['"]https?:\/\//i.test(line)) {
			results.push({
				rule: "No third-party imports at top level",
				status: "warn",
				message: `Third-party import at line ${i + 1} — move to delayed.js if not critical`,
				file: "scripts/scripts.js",
				line: i + 1,
			});
		}
	}

	// Check for header/footer loading in eager phase
	if (hasLoadEager) {
		const eagerBody = extractFunctionBody(content, "loadEager");
		if (eagerBody && /loadHeader|loadFooter/.test(eagerBody)) {
			results.push({
				rule: "Header/footer not in loadEager",
				status: "warn",
				message: "Header/footer in loadEager delays LCP — move to loadLazy",
				file: "scripts/scripts.js",
			});
		}
	}
}

// ── styles.css ─────────────────────────────────────────────

async function checkStylesCss(root: string, results: AuditResult[]) {
	const filePath = path.join(root, "styles", "styles.css");
	if (!existsSync(filePath)) return;

	const stats = await stat(filePath);
	const sizeKb = stats.size / 1024;

	results.push({
		rule: "styles.css size within LCP budget",
		status: sizeKb > 40 ? "warn" : "pass",
		message: `${sizeKb.toFixed(1)} KB${sizeKb > 40 ? " — large CSS competes with 100KB LCP budget" : ""}`,
		file: "styles/styles.css",
	});

	// Check for @import (render-blocking chain)
	const content = await readFile(filePath, "utf-8");
	if (/@import\s/.test(content)) {
		results.push({
			rule: "No @import in styles.css",
			status: "warn",
			message: "@import creates a request chain — inline the CSS or use lazy-styles.css",
			file: "styles/styles.css",
		});
	}
}

// ── delayed.js ─────────────────────────────────────────────

async function checkDelayedJs(root: string, results: AuditResult[]) {
	const filePath = path.join(root, "scripts", "delayed.js");
	if (!existsSync(filePath)) {
		results.push({
			rule: "scripts/delayed.js exists",
			status: "info",
			message: "No delayed.js — third-party scripts should go here",
		});
		return;
	}

	const content = await readFile(filePath, "utf-8");

	// Check it actually has content (not just the stub comment)
	const stripped = content
		.replace(/\/\/.*$/gm, "")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.trim();
	if (!stripped) {
		results.push({
			rule: "delayed.js has content",
			status: "info",
			message: "delayed.js is empty — add analytics/martech here",
			file: "scripts/delayed.js",
		});
	}
}

// ── Block JS files ─────────────────────────────────────────

async function checkBlocks(root: string, results: AuditResult[]) {
	const blocksDir = path.join(root, "blocks");
	if (!existsSync(blocksDir)) return;

	const entries = await readdir(blocksDir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const blockName = entry.name;
		const jsFile = path.join(blocksDir, blockName, `${blockName}.js`);
		if (!existsSync(jsFile)) continue;

		const content = await readFile(jsFile, "utf-8");
		const lines = content.split("\n");

		// Check for heavy library imports
		const heavyLibs = [
			"jquery",
			"lodash",
			"moment",
			"rxjs",
			"d3",
			"three",
			"gsap",
			"anime",
			"chart.js",
			"swiper",
		];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].toLowerCase();
			for (const lib of heavyLibs) {
				if (line.includes("from") && line.includes(lib) && /import\s/.test(line)) {
					results.push({
						rule: "No heavy imports in blocks",
						status: "warn",
						message: `Imports "${lib}" — heavy library delays section loading`,
						file: `blocks/${blockName}/${blockName}.js`,
						line: i + 1,
					});
				}
			}
		}

		// Check for synchronous DOM-heavy patterns
		if (/document\.write/i.test(content)) {
			results.push({
				rule: "No document.write in blocks",
				status: "fail",
				message: "document.write blocks parsing and can break the page",
				file: `blocks/${blockName}/${blockName}.js`,
			});
		}

		// Check block JS file size
		const stats = await stat(jsFile);
		const sizeKb = stats.size / 1024;
		if (sizeKb > 20) {
			results.push({
				rule: "Block JS size reasonable",
				status: "warn",
				message: `${sizeKb.toFixed(1)} KB — consider splitting or lazy-loading parts`,
				file: `blocks/${blockName}/${blockName}.js`,
			});
		}
	}

	// Check block CSS for unscoped selectors
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const blockName = entry.name;
		const cssFile = path.join(blocksDir, blockName, `${blockName}.css`);
		if (!existsSync(cssFile)) continue;

		const content = await readFile(cssFile, "utf-8");

		// Simple check: top-level selectors that don't start with .blockname
		const selectorPattern = /^([a-z][a-z0-9-]*)\s*\{/gm;
		for (const selectorMatch of content.matchAll(selectorPattern)) {
			const selector = selectorMatch[1];
			if (!["body", "html", "main"].includes(selector)) {
				results.push({
					rule: "Block CSS is scoped",
					status: "warn",
					message: `Bare element selector "${selector}" — may leak styles and cause CLS. Use .${blockName} prefix`,
					file: `blocks/${blockName}/${blockName}.css`,
				});
			}
		}
	}
}

// ── aem.js ─────────────────────────────────────────────────

async function checkAemJs(root: string, results: AuditResult[]) {
	const filePath = path.join(root, "scripts", "aem.js");
	if (!existsSync(filePath)) {
		results.push({
			rule: "scripts/aem.js exists",
			status: "warn",
			message: "Missing aem.js (or lib-franklin.js) — the EDS framework library",
		});
		return;
	}

	results.push({
		rule: "aem.js present",
		status: "pass",
		message: "Found — remember: never modify this file",
		file: "scripts/aem.js",
	});
}

// ── Helpers ────────────────────────────────────────────────

function extractFunctionBody(source: string, funcName: string): string | null {
	const pattern = new RegExp(`(?:async\\s+)?function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`);
	const match = pattern.exec(source);
	if (!match) return null;

	let depth = 1;
	let i = match.index + match[0].length;
	const start = i;
	while (i < source.length && depth > 0) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") depth--;
		i++;
	}
	return source.slice(start, i - 1);
}

function printResults(results: AuditResult[]) {
	// Group by file
	const grouped = new Map<string, AuditResult[]>();
	for (const r of results) {
		const key = r.file || "general";
		const bucket = grouped.get(key) ?? [];
		bucket.push(r);
		grouped.set(key, bucket);
	}

	for (const [file, fileResults] of grouped) {
		logger.info(`  ${ui.icon.bullet} ${chalk.underline(file)}`);
		for (const r of fileResults) {
			const loc = r.line ? chalk.dim(`:${r.line}`) : "";
			logger.info(`    ${ui.statusIcon(r.status)} ${r.rule}${loc}`);
			if (r.status !== "pass") {
				logger.info(chalk.dim(`       ${r.message}`));
			}
		}
		logger.info("");
	}

	const counts = {
		pass: results.filter((r) => r.status === "pass").length,
		warn: results.filter((r) => r.status === "warn").length,
		fail: results.filter((r) => r.status === "fail").length,
		info: results.filter((r) => r.status === "info").length,
	};

	logger.info(ui.box([ui.summary(counts)]));
	if (counts.fail > 0) process.exitCode = 1;
}
