import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import * as ui from "../lib/ui.js";

interface AuditSecurityOptions {
	json?: boolean;
}

type Severity = "critical" | "high" | "moderate" | "low";

interface Finding {
	severity: Severity;
	rule: string;
	message: string;
	file: string;
	line: number;
	snippet: string;
}

interface Rule {
	id: string;
	severity: Severity;
	re: RegExp;
	message: string;
	ext: string[];
	/** Optional extra predicate on the matched line (e.g. negative look-aside). */
	extra?: (line: string) => boolean;
}

// Ordered: dynamic innerHTML before static so we don't double-report a line.
const RULES: Rule[] = [
	{
		id: "eval",
		severity: "critical",
		re: /\beval\s*\(/,
		message: "eval() executes arbitrary code — prime XSS / RCE vector",
		ext: ["js", "mjs", "html"],
	},
	{
		id: "aws-key",
		severity: "critical",
		re: /\bAKIA[0-9A-Z]{16}\b/,
		message: "Hardcoded AWS access key id",
		ext: ["js", "mjs", "html", "json"],
	},
	{
		id: "private-key",
		severity: "critical",
		re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
		message: "Embedded private key material",
		ext: ["js", "mjs", "html", "json", "pem", "txt"],
	},
	{
		id: "new-function",
		severity: "high",
		re: /\bnew\s+Function\s*\(/,
		message: "new Function() runs strings as code",
		ext: ["js", "mjs", "html"],
	},
	{
		id: "document-write",
		severity: "high",
		re: /document\.write(?:ln)?\s*\(/,
		message: "document.write() enables XSS and blocks parsing",
		ext: ["js", "mjs", "html"],
	},
	{
		id: "innerhtml-dynamic",
		severity: "high",
		re: /\.(?:inner|outer)HTML\s*=\s*[^;\n]*(?:\$\{|\+|concat)/,
		message: "Dynamic innerHTML assignment — sanitize or use textContent / DOM APIs",
		ext: ["js", "mjs"],
	},
	{
		id: "insert-adjacent-html",
		severity: "high",
		re: /insertAdjacentHTML\s*\(/,
		message: "insertAdjacentHTML with untrusted data is an XSS vector",
		ext: ["js", "mjs"],
	},
	{
		id: "js-url",
		severity: "high",
		re: /(?:href|src)\s*=\s*["']?\s*javascript:/i,
		message: "javascript: URL — XSS vector",
		ext: ["js", "mjs", "html"],
	},
	{
		id: "secret",
		severity: "high",
		re: /(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|client[_-]?secret|passwd|password)\s*[:=]\s*["'][^"']{8,}["']/i,
		message: "Possible hardcoded secret / credential",
		ext: ["js", "mjs", "html", "json"],
		// Skip obvious placeholders.
		extra: (line) => !/(example|placeholder|your[-_]|changeme|xxxx|<[^>]+>|\$\{)/i.test(line),
	},
	{
		id: "bearer-token",
		severity: "high",
		re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
		message: "Hardcoded bearer token",
		ext: ["js", "mjs", "html", "json"],
	},
	{
		id: "innerhtml-static",
		severity: "moderate",
		re: /\.(?:inner|outer)HTML\s*=/,
		message: "innerHTML assignment — confirm the content is trusted / sanitized",
		ext: ["js", "mjs"],
	},
	{
		id: "insecure-url",
		severity: "moderate",
		re: /(?:href|src)\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)/i,
		message: "Insecure http:// resource — mixed content, use https://",
		ext: ["html", "js", "mjs"],
	},
	{
		id: "target-blank",
		severity: "moderate",
		re: /target\s*=\s*["']_blank["']/,
		message: 'target="_blank" without rel="noopener" — reverse tabnabbing',
		ext: ["html", "js", "mjs"],
		extra: (line) => !/rel\s*=\s*["'][^"']*noopener/i.test(line),
	},
	{
		id: "postmessage-wildcard",
		severity: "moderate",
		re: /postMessage\s*\([^,]+,\s*["']\*["']\s*\)/,
		message: "postMessage to '*' origin — restrict the target origin",
		ext: ["js", "mjs"],
	},
	{
		id: "inline-handler",
		severity: "low",
		re: /\son[a-z]+\s*=\s*["']/i,
		message: "Inline event handler — move to addEventListener (CSP-unfriendly)",
		ext: ["html"],
	},
	{
		id: "console-log",
		severity: "low",
		re: /console\.(?:log|debug)\s*\(/,
		message: "console.log / debug left in code — potential info leak",
		ext: ["js", "mjs"],
	},
];

const SEVERITY_ORDER: Severity[] = ["critical", "high", "moderate", "low"];
const SEVERITY_META: Record<Severity, { status: ui.Status; label: string }> = {
	critical: { status: "fail", label: "CRIT" },
	high: { status: "fail", label: "HIGH" },
	moderate: { status: "warn", label: "MOD " },
	low: { status: "info", label: "LOW " },
};

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vscode", "coverage"]);
const SCAN_EXT = new Set(["js", "mjs", "html", "json", "pem", "txt"]);

async function* walk(dir: string): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (IGNORE_DIRS.has(entry.name)) continue;
			yield* walk(full);
		} else if (entry.isFile()) {
			yield full;
		}
	}
}

function scanContent(content: string, relFile: string, ext: string): Finding[] {
	const findings: Finding[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let innerHtmlDynamicHit = false;
		for (const rule of RULES) {
			if (!rule.ext.includes(ext)) continue;
			// Don't double-report the same innerHTML line as both dynamic + static.
			if (rule.id === "innerhtml-static" && innerHtmlDynamicHit) continue;
			if (!rule.re.test(line)) continue;
			if (rule.extra && !rule.extra(line)) continue;
			if (rule.id === "innerhtml-dynamic") innerHtmlDynamicHit = true;
			findings.push({
				severity: rule.severity,
				rule: rule.id,
				message: rule.message,
				file: relFile,
				line: i + 1,
				snippet: line.trim().slice(0, 100),
			});
		}
	}
	return findings;
}

interface DepReport {
	status: "ok" | "vulnerable" | "skipped";
	counts?: { critical: number; high: number; moderate: number; low: number };
	note?: string;
}

async function auditDependencies(root: string): Promise<DepReport> {
	if (!existsSync(path.join(root, "package.json"))) {
		return { status: "skipped", note: "no package.json" };
	}
	const hasLock =
		existsSync(path.join(root, "package-lock.json")) ||
		existsSync(path.join(root, "npm-shrinkwrap.json"));
	if (!hasLock && !existsSync(path.join(root, "node_modules"))) {
		return { status: "skipped", note: "no package-lock.json / node_modules — run npm install" };
	}
	try {
		const { execa } = await import("execa");
		const { stdout } = await execa("npm", ["audit", "--json"], {
			cwd: root,
			reject: false,
		});
		const data = JSON.parse(stdout);
		const v = data?.metadata?.vulnerabilities ?? {};
		const counts = {
			critical: v.critical ?? 0,
			high: v.high ?? 0,
			moderate: v.moderate ?? 0,
			low: v.low ?? 0,
		};
		const total = counts.critical + counts.high + counts.moderate + counts.low;
		return { status: total > 0 ? "vulnerable" : "ok", counts };
	} catch (err) {
		return { status: "skipped", note: `npm audit failed: ${(err as Error).message}` };
	}
}

export async function auditSecurity(options: AuditSecurityOptions = {}): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no fstab.yaml found).");
		process.exitCode = 1;
		return;
	}

	// ── Exploit / code scan ──────────────────────────────────
	const findings: Finding[] = [];
	for await (const file of walk(projectRoot)) {
		const ext = path.extname(file).slice(1).toLowerCase();
		if (!SCAN_EXT.has(ext)) continue;
		// Never flag the EDS framework library — it's vendored and not ours to edit.
		const rel = path.relative(projectRoot, file);
		if (rel.endsWith("aem.js") || rel.endsWith("lib-franklin.js")) continue;
		const content = await readFile(file, "utf-8");
		findings.push(...scanContent(content, rel, ext));
	}

	// ── Dependency vulnerabilities ───────────────────────────
	const deps = await auditDependencies(projectRoot);

	const bySeverity = (s: Severity) => findings.filter((f) => f.severity === s);
	const codeCounts = {
		critical: bySeverity("critical").length,
		high: bySeverity("high").length,
		moderate: bySeverity("moderate").length,
		low: bySeverity("low").length,
	};
	const hardFail =
		codeCounts.critical > 0 ||
		codeCounts.high > 0 ||
		(deps.counts?.critical ?? 0) > 0 ||
		(deps.counts?.high ?? 0) > 0;

	if (options.json) {
		console.log(
			JSON.stringify(
				{ projectRoot, dependencies: deps, findings, summary: { code: codeCounts } },
				null,
				2,
			),
		);
		if (hardFail) process.exitCode = 1;
		return;
	}

	logger.info(ui.logo("Security Audit"));
	logger.info(ui.heading("Dependencies", "npm audit"));
	if (deps.status === "skipped") {
		logger.info(ui.statusLine("info", "npm audit", deps.note ?? "skipped"));
	} else if (deps.status === "ok") {
		logger.info(ui.statusLine("pass", "npm audit", "no known vulnerabilities"));
	} else {
		const c = deps.counts ?? { critical: 0, high: 0, moderate: 0, low: 0 };
		logger.info(
			ui.statusLine(
				c.critical + c.high > 0 ? "fail" : "warn",
				"npm audit",
				`${c.critical} critical, ${c.high} high, ${c.moderate} moderate, ${c.low} low — run \`npm audit fix\``,
			),
		);
	}

	logger.info(ui.heading("Exploit scan", "XSS · secrets · injection · tabnabbing"));
	if (findings.length === 0) {
		logger.info(ui.statusLine("pass", "code", "no risky patterns found"));
	} else {
		const sorted = [...findings].sort(
			(a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
		);
		for (const f of sorted) {
			const meta = SEVERITY_META[f.severity];
			const loc = chalk.dim(`${f.file}:${f.line}`);
			logger.info(`  ${ui.statusIcon(meta.status)} ${chalk.bold(meta.label)} ${f.message}  ${loc}`);
			logger.info(chalk.dim(`         ${f.snippet}`));
		}
	}

	logger.info("");
	logger.info(
		ui.box([
			ui.summary({
				fail:
					codeCounts.critical +
					codeCounts.high +
					(deps.counts?.critical ?? 0) +
					(deps.counts?.high ?? 0),
				warn: codeCounts.moderate + (deps.counts?.moderate ?? 0),
				info: codeCounts.low + (deps.counts?.low ?? 0),
			}),
		]),
	);
	if (hardFail) process.exitCode = 1;
}
