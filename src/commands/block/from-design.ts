import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import { detectAgent, detectAllAgents } from "../../lib/agents/detect.js";
import { invokeAgent, savePromptToFile } from "../../lib/agents/invoke.js";
import { isLocalAgent } from "../../lib/agents/local.js";
import { loadConfig } from "../../lib/config.js";
import { resolveBreakpoints } from "../../lib/figma/breakpoints.js";
import { isScrapeable, resolveDesign } from "../../lib/figma/design-source.js";
import { parseFigmaUrl } from "../../lib/figma/node-id.js";
import { DEFAULT_REST_PER_MINUTE } from "../../lib/figma/pacer.js";
import {
	type ContentSource,
	type DesignProvider,
	PROMPT_VERSION,
	PROVIDER_NAMES,
	buildPrompt,
	buildRefinePrompt,
} from "../../lib/figma/prompt-builder.js";
import { logger } from "../../lib/logger.js";
import { findProjectRoot } from "../../lib/project.js";
import { kebabCaseRegex } from "../../lib/schemas.js";
import {
	authStatePath,
	ensureAuthDir,
	hasAuthState,
	secureAuthFile,
} from "../../lib/scrape/auth.js";
import { captureAuthState } from "../../lib/scrape/web.js";
import { stopHint, waitForStop } from "../../lib/session.js";
import * as ui from "../../lib/ui.js";
import type { AgentInfo, AgentType, FigmaUrlParts } from "../../types/index.js";

interface FromDesignOptions {
	name?: string;
	agent?: string;
	/** Model to run (Claude alias / id, or a local model name like qwen2.5-coder:14b). */
	model?: string;
	dryRun?: boolean;
	/** Generate the Universal Editor model. Defaults to true (`--no-ue-model` disables). */
	ueModel?: boolean;
	yes?: boolean;
	/** Where the block's content comes from (default: document). */
	source?: ContentSource;
	/** Optional CF model / GraphQL persisted-query hint (cf/mixed). */
	cfHint?: string;
	/** Add a screenshot MCP call for pixel verification. Opt-in (`--screenshot`) — each MCP call is scarce. */
	screenshot?: boolean;
	/**
	 * Auto-start the preview after generating. Only applies to non-interactive
	 * (`--yes`) runs and is **off by default** — generating a block should not
	 * hijack the terminal with a server. Interactive runs open the preview on
	 * demand from the post-generation menu instead.
	 */
	serve?: boolean;
	/** Design source. Defaults to figma. */
	provider?: DesignProvider;
	/** Design frame widths for preview breakpoints (comma-separated, e.g. 390,768,1440). */
	widths?: string;
	/** Force the Figma MCP adapter even when a REST token is available. */
	mcp?: boolean;
	/** Ignore any cached design snapshot and re-fetch. */
	refresh?: boolean;
	/** Use the bundled sample design (Kiri Bloom hero) — no URL, token or MCP. */
	sample?: boolean;
	/** Scrape with a logged-in session (reuse a saved one, or capture it once). */
	auth?: boolean;
	/** Force a fresh login even if a session is already saved. */
	authRefresh?: boolean;
}

/**
 * Absolute path to the design that ships with the package (`samples/hero.svg`),
 * so `--sample` works offline with no Figma URL, token or MCP. Resolved relative
 * to this module: in the published build everything is bundled into
 * `dist/bin/eds.js` (→ `../../samples`); under tsx it runs from
 * `src/commands/block/` (→ `../../../samples`). Returns null if the asset is
 * missing (shouldn't happen in a published install).
 */
function resolveBundledSample(): string | null {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.resolve(here, "../../samples/hero.svg"), // published: dist/bin → pkg root
		path.resolve(here, "../../../samples/hero.svg"), // dev (tsx): src/commands/block
	];
	return candidates.find((p) => existsSync(p)) ?? null;
}

/** Is an eds preview server already answering on this port? */
async function previewRunning(port = 8777): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 400);
		const res = await fetch(`http://127.0.0.1:${port}/__eds_ping`, { signal: ctrl.signal });
		clearTimeout(t);
		if (!res.ok) return false;
		const data = (await res.json()) as { eds?: boolean };
		return data?.eds === true;
	} catch {
		return false;
	}
}

/**
 * Interactive, step-by-step wizard used when `eds block from-design` is run
 * without a URL. Collects everything the flags would, including the content
 * source (document / UE / Content Fragment / mixed), then hands control back
 * to the normal flow. Returns null if the user cancels at the summary.
 */
async function runWizard(
	figmaUrl: string | undefined,
): Promise<(FromDesignOptions & { figmaUrl: string }) | null> {
	const { input, select, confirm } = await import("../../lib/prompts.js");

	const provider = (await select({
		message: "1/7  Design source",
		choices: [
			{ name: "Figma  (REST / MCP / local)", value: "figma" },
			{ name: "Framer  (scraped, headless Chromium)", value: "framer" },
			{ name: "Google Stitch  (scraped, headless Chromium)", value: "stitch" },
		],
		default: "figma",
	})) as DesignProvider;

	const name = await input({
		message: "2/7  Component name",
		validate: (v) => kebabCaseRegex.test(v.trim()) || "Use kebab-case, e.g. hero-banner",
	});

	const url =
		figmaUrl ??
		(await input({
			message: `3/7  ${PROVIDER_NAMES[provider]} link`,
			validate: (v) => {
				if (!v.trim()) return "Paste the design link";
				if (provider !== "figma") {
					return /^https?:\/\//i.test(v.trim()) || "Paste a public http(s) URL to the page";
				}
				try {
					parseFigmaUrl(v.trim());
					return true;
				} catch (err) {
					return (err as Error).message;
				}
			},
		}));

	const source = (await select({
		message: "4/7  Where does the content come from?",
		choices: [
			{ name: "Document authoring (default EDS)", value: "document" },
			{ name: "Universal Editor", value: "ue" },
			{ name: "Content Fragment", value: "cf" },
			{ name: "Mixed - Universal Editor + Content Fragment", value: "mixed" },
		],
		default: "document",
	})) as ContentSource;

	let cfHint: string | undefined;
	if (source === "cf" || source === "mixed") {
		const hint = await input({
			message: "     CF model / GraphQL persisted-query name (optional)",
		});
		cfHint = hint.trim() || undefined;
	}

	const ueModel = await confirm({
		message: "5/7  Generate the Universal Editor model?",
		default: true,
	});

	const screenshot = await confirm({
		message: "6/7  Add a screenshot MCP call for a pixel check? (off = one fewer MCP call)",
		default: false,
	});

	const agents = await detectAllAgents();
	const runMode = await select({
		message: "7/7  Run with",
		choices: [
			...agents.map((a) => ({
				name: a.model
					? `${a.type} · ${a.model} (local)`
					: `${a.type}${provider === "figma" && !a.hasFigmaMcp ? " (Figma MCP not detected)" : ""}`,
				value: `agent:${a.type}`,
			})),
			{ name: "Preview the prompt only (--dry-run)", value: "dry-run" },
			{ name: "Save the prompt, run it later (--agent none)", value: "none" },
		],
		default: agents[0] ? `agent:${agents[0].type}` : "dry-run",
	});

	const sourceLabel = PROVIDER_NAMES[provider].toLowerCase();
	logger.info(ui.heading("Summary"));
	const w = ui.columnWidth(["component", sourceLabel, "content", "ue model", "screenshot", "run"]);
	logger.info(ui.accentLine("component", name, w));
	const designRef =
		provider === "figma"
			? (() => {
					const parsed = parseFigmaUrl(url.trim());
					return parsed.nodeId ? `node ${parsed.nodeId}` : parsed.fileKey;
				})()
			: url.trim();
	logger.info(ui.accentLine(sourceLabel, designRef, w));
	logger.info(ui.accentLine("content", source + (cfHint ? ` (${cfHint})` : ""), w));
	logger.info(ui.accentLine("ue model", ueModel ? "yes" : "no", w));
	logger.info(ui.accentLine("screenshot", screenshot ? "yes" : "no (token-lean)", w));
	logger.info(ui.accentLine("run", runMode.replace("agent:", ""), w));
	logger.info("");

	const go = await confirm({ message: "Generate this block?", default: true });
	if (!go) return null;

	const opts: FromDesignOptions & { figmaUrl: string } = {
		figmaUrl: url.trim(),
		name,
		provider,
		source,
		cfHint,
		ueModel,
		screenshot,
	};
	if (runMode === "dry-run") opts.dryRun = true;
	else if (runMode === "none") opts.agent = "none";
	else {
		opts.agent = runMode.replace("agent:", "");
		opts.yes = true;
	}
	return opts;
}

function inferBlockName(fileName?: string): string {
	if (!fileName) return "design-block";
	return (
		fileName
			.replace(/[-_\s]+/g, "-")
			.replace(/[^a-z0-9-]/gi, "")
			.toLowerCase()
			.replace(/^-+|-+$/g, "") || "design-block"
	);
}

/** Best-effort block-name seed from a scrape URL: last path segment, else host. */
function slugFromUrl(url: string): string {
	try {
		const u = new URL(url);
		const seg = u.pathname.split("/").filter(Boolean).pop();
		return seg || u.hostname.split(".")[0];
	} catch {
		return "";
	}
}

/** Infer the design provider from a URL host when `--provider` isn't given. */
function detectProvider(url?: string): DesignProvider | undefined {
	if (!url) return undefined;
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (host.includes("figma.com")) return "figma";
		if (host.includes("framer")) return "framer";
		if (host.includes("stitch")) return "stitch";
	} catch {
		// not a URL (e.g. a local file path) — leave undetected
	}
	return undefined;
}

const CONTENT_SOURCES: ContentSource[] = ["document", "ue", "cf", "mixed"];

const DESIGN_FILE_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);

/**
 * If the `from-design` argument points at a local design export (SVG/PNG/JPG)
 * rather than a URL, return its absolute path — the quota-free path that reads
 * the design straight from disk instead of any design MCP. Returns null for URLs
 * and for non-design files.
 */
function resolveLocalDesignFile(arg: string): string | null {
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) return null; // a URL, not a path
	const abs = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
	if (!existsSync(abs)) return null;
	if (!DESIGN_FILE_EXTS.has(path.extname(abs).toLowerCase())) return null;
	return abs;
}

export async function blockFromDesign(
	figmaUrlArg: string | undefined,
	optionsArg: FromDesignOptions,
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error(
			"Not inside an EDS project (no EDS project markers found). Run this from your project root.",
		);
		process.exitCode = 1;
		return;
	}

	await logger.logoOnceAnimated("Design → EDS block");

	let designUrl = figmaUrlArg;
	let options = optionsArg;

	// `--sample` (no design given) → use the bundled Kiri Bloom hero SVG: a
	// zero-config, token-free, MCP-free try-it that still runs the real pipeline.
	if (!designUrl && options.sample) {
		const sample = resolveBundledSample();
		if (!sample) {
			logger.error("Bundled sample design not found (samples/hero.svg).");
			process.exitCode = 1;
			return;
		}
		designUrl = sample;
		options = { name: "hero", provider: "figma", ...options };
		logger.info(
			`  ${ui.icon.pass} Sample design  ${chalk.dim("Kiri Bloom hero")}  ${chalk.dim("(bundled · no token · no MCP)")}`,
		);
	}

	// No URL given → run the interactive, step-by-step wizard.
	if (!designUrl) {
		const wiz = await runWizard(designUrl);
		if (!wiz) {
			logger.info("Cancelled.");
			return;
		}
		designUrl = wiz.figmaUrl;
		options = { ...options, ...wiz };
	}

	// Provider: explicit --provider wins, else inferred from the URL host, else figma.
	const explicitProvider = options.provider;
	if (explicitProvider && !(explicitProvider in PROVIDER_NAMES)) {
		logger.error(`Unknown --provider "${explicitProvider}". Use: figma, framer or stitch.`);
		process.exitCode = 1;
		return;
	}
	if (options.source && !CONTENT_SOURCES.includes(options.source)) {
		logger.error(`Unknown --source "${options.source}". Use: ${CONTENT_SOURCES.join(", ")}.`);
		process.exitCode = 1;
		return;
	}
	const provider: DesignProvider = explicitProvider ?? detectProvider(designUrl) ?? "figma";
	const providerName = PROVIDER_NAMES[provider];

	// Resolve the design reference. A local SVG/PNG path reads straight from disk
	// (no MCP — quota-free). Figma links are parsed into file/node parts (which feed
	// REST/MCP); Framer and Stitch links are scraped with headless Chromium.
	const localDesignFile = resolveLocalDesignFile(designUrl);
	// Path to hand the agent: relative to projectRoot (its cwd) when inside it.
	const localPromptPath = localDesignFile
		? localDesignFile.startsWith(projectRoot + path.sep)
			? path.relative(projectRoot, localDesignFile)
			: localDesignFile
		: undefined;

	let figma: FigmaUrlParts | null = null;
	const designRef = localPromptPath ?? designUrl;
	if (localDesignFile) {
		logger.info(
			`  ${ui.icon.pass} Local design file  ${chalk.dim(localPromptPath)}  ${chalk.dim("(no Figma MCP)")}`,
		);
	} else if (provider === "figma") {
		const spinner = ora("Parsing Figma URL...").start();
		try {
			figma = parseFigmaUrl(designUrl);
			spinner.succeed(
				`Parsed Figma URL  ${chalk.dim(figma.nodeId ? `node ${figma.nodeId}` : `file ${figma.fileKey}`)}`,
			);
		} catch (err) {
			spinner.fail((err as Error).message);
			process.exitCode = 1;
			return;
		}
	} else {
		logger.info(`  ${ui.icon.pass} ${providerName} design  ${chalk.dim(designRef)}`);
	}

	// Determine block name. For a local file, infer from its base name; for Figma,
	// from the file slug; non-Figma URL providers can't infer one, so --name is
	// required there.
	const blockName =
		options.name ||
		(localDesignFile
			? inferBlockName(path.basename(localDesignFile, path.extname(localDesignFile)))
			: figma
				? inferBlockName(figma.fileName)
				: designUrl
					? inferBlockName(slugFromUrl(designUrl))
					: "");
	if (!kebabCaseRegex.test(blockName)) {
		logger.error(
			`Invalid block name "${blockName}". Use --name with a kebab-case name (e.g., --name hero-banner).`,
		);
		process.exitCode = 1;
		return;
	}

	// The Figma file slug names the whole file, not the selected node — so when a
	// specific frame is selected and no --name was given, the inferred name is
	// usually wrong (e.g. the full kit name). Nudge toward --name.
	if (!options.name && figma?.nodeId) {
		logger.warn(`Block name "${blockName}" came from the Figma file name, not the selected frame.`);
		logger.info(chalk.dim(`  Pass ${chalk.cyan("--name <kebab-case>")} for a cleaner block name.`));
	}

	// Load config early — we need the Figma token (if any) to resolve the design.
	const config = await loadConfig(projectRoot);
	const figmaToken = config.figma?.token ?? process.env.FIGMA_TOKEN ?? process.env.FIGMA_PAT;

	// Gated scrape sources (Google Stitch, private Framer / pages) need a logged-in
	// session. With --auth, reuse a saved session or capture one once via a headed
	// login — the session (cookies/localStorage) is stored owner-only under ~/.eds/auth/.
	let storageStatePath: string | undefined;
	if (
		isScrapeable(provider) &&
		!localDesignFile &&
		!options.dryRun &&
		(options.auth || options.authRefresh)
	) {
		storageStatePath = authStatePath(provider);
		if (options.authRefresh || !hasAuthState(provider)) {
			// Land on the site origin (where Sign-In lives) — the deep design URL
			// 404s ("isn't shared with you") until you're authenticated.
			const loginUrl = (() => {
				try {
					return new URL(designUrl).origin;
				} catch {
					return designUrl;
				}
			})();
			logger.info(
				`  ${chalk.dim("→")} Opening ${chalk.cyan(providerName)} — click ${chalk.cyan("Sign In")} and log in, then come back here.`,
			);
			const { input } = await import("../../lib/prompts.js");
			try {
				await ensureAuthDir(storageStatePath);
				await captureAuthState({
					loginUrl,
					statePath: storageStatePath,
					projectRoot,
					waitForUser: async () => {
						await input({
							message: "Press Enter once you're signed in (you don't need to open the design)",
						});
					},
				});
				await secureAuthFile(storageStatePath);
				logger.info(`  ${ui.icon.pass} Session saved  ${chalk.dim(storageStatePath)}`);
			} catch (e) {
				logger.error(
					`Could not capture the ${providerName} session: ${e instanceof Error ? e.message : String(e)}`,
				);
				process.exitCode = 1;
				return;
			}
		} else {
			logger.info(
				`  ${ui.icon.pass} Using saved ${providerName} session  ${chalk.dim(storageStatePath)}  ${chalk.dim("(--auth-refresh to re-login)")}`,
			);
		}
	}

	// Fetch phase: turn the reference into an embeddable design (file / cached
	// spec / REST spec / scrape / MCP-fetch-once), caching so refines never re-fetch.
	const designSpinner = ora("Resolving design source...").start();
	const resolved = await resolveDesign({
		figma,
		localFile: localPromptPath,
		token: figmaToken,
		projectRoot,
		preferMcp: options.mcp,
		refresh: options.refresh,
		provider,
		designUrl: localDesignFile ? undefined : designUrl,
		storageStatePath,
		dryRun: options.dryRun,
		restPerMinute: config.figma?.restPerMinute,
		onRestWait: (ms) => {
			designSpinner.text = `Resolving design source... waiting ${Math.ceil(ms / 1000)} s for a Figma REST slot (${config.figma?.restPerMinute ?? DEFAULT_REST_PER_MINUTE}/min)`;
		},
	});
	if (resolved.scrapeError) {
		designSpinner.fail(`Scrape failed: ${resolved.scrapeError}`);
		logger.info(
			chalk.dim(
				`  Check the URL is a public ${providerName} page, and that Chromium is installed (${chalk.cyan("npx playwright install chromium")}).`,
			),
		);
		process.exitCode = 1;
		return;
	}
	if (resolved.rateLimit) {
		designSpinner.fail(resolved.rateLimit.message);
		logger.info(
			chalk.dim(
				"  The limit follows the plan that owns the file: 20 calls/month on Starter or with a View/Collab seat, 10-20/min with a Dev/Full seat on a paid plan.",
			),
		);
		logger.info(
			chalk.dim(
				`  Not falling back to Figma MCP (its budget is the same or smaller). Re-run after the reset, pass ${chalk.cyan("--mcp")} to spend an MCP call instead, or export the frame as PNG/SVG (no quota).`,
			),
		);
		if (resolved.rateLimit.upgradeLink)
			logger.info(chalk.dim(`  Plan details: ${resolved.rateLimit.upgradeLink}`));
		process.exitCode = 1;
		return;
	}
	designSpinner.succeed(`Design source  ${chalk.dim(resolved.summary)}`);
	if (resolved.restError) {
		logger.warn(`Figma REST fetch failed, using MCP fallback: ${resolved.restError}`);
	}

	// A scrape that lands on a login / 404 shell (gated source, or wrong URL)
	// yields a near-empty page — catch that and point at --auth instead of
	// silently caching garbage the agent would try to reproduce.
	if (resolved.design?.mode === "scrape" && !options.dryRun) {
		try {
			const spec = JSON.parse(resolved.design.spec) as { title?: string; nodeCount?: number };
			const title = (spec.title ?? "").toLowerCase();
			const raw = resolved.design.spec.toLowerCase();
			// Strong error phrases scanned in the whole spec; weaker signals (bare
			// "sign in", low node count) only to nudge.
			const errorPhrase = /isn'?t shared|doesn'?t exist|page not found|\b404\b/;
			const looksGated =
				errorPhrase.test(title) ||
				errorPhrase.test(raw) ||
				/\bsign[ -]?in\b|\blog[ -]?in\b/.test(title) ||
				(spec.nodeCount ?? 0) < 8;
			if (looksGated) {
				logger.warn(
					`The scraped page looks like a login / error shell${spec.title ? ` ("${spec.title}")` : ""} — the design may be gated or the URL wrong.`,
				);
				logger.info(
					chalk.dim(
						`  Use ${chalk.cyan("--auth")} to log in once (or ${chalk.cyan("--auth-refresh")} to re-login), and confirm the URL opens the design when you're signed in.`,
					),
				);
			}
		} catch {
			// unparseable spec — leave it to the agent
		}
	}

	// Build prompt (reads project design tokens from styles/styles.css)
	const promptSpinner = ora("Reading design tokens & building prompt...").start();
	const prompt = await buildPrompt({
		provider,
		figma,
		designRef,
		blockName,
		projectRoot,
		withUeModel: options.ueModel !== false,
		contentSource: options.source ?? "document",
		cfHint: options.cfHint,
		screenshot: options.screenshot === true,
		design: resolved.design,
	});
	const promptFile = await savePromptToFile(prompt, projectRoot);
	const hasTokens = existsSync(path.join(projectRoot, "styles", "styles.css"));
	promptSpinner.succeed(
		hasTokens
			? `Loaded design tokens  ${chalk.dim("styles/styles.css")}`
			: `Built prompt  ${chalk.dim("no project tokens found")}`,
	);
	logger.info(chalk.dim(`  prompt → ${promptFile}`));

	// Dry run — stop here
	if (options.dryRun) {
		logger.info("");
		logger.info(chalk.yellow("Dry run mode — prompt generated but agent not invoked."));
		logger.info(`Prompt file: ${chalk.cyan(promptFile)}`);
		logger.info(`Block name:  ${chalk.cyan(blockName)}`);
		logger.info(`Prompt version: ${PROMPT_VERSION}`);
		logger.info("");
		logger.info("Preview:");
		logger.info(chalk.dim("─".repeat(60)));
		console.log(prompt);
		return;
	}

	// Detect agent
	const preferredAgent = (options.agent as AgentType) || config.agent;

	if (options.agent === "none") {
		logger.info("Agent skipped (--agent none). Use the prompt file manually:");
		logger.info(`  ${chalk.cyan(promptFile)}`);
		return;
	}

	const agentSpinner = ora("Detecting AI agent...").start();
	const agent = await detectAgent(preferredAgent);

	if (!agent) {
		agentSpinner.fail(
			"No AI agent found (claude, cursor, codex, or a local Ollama / oMLX server).",
		);
		logger.info(`Install Claude Code: ${chalk.cyan("npm install -g @anthropic-ai/claude-code")}`);
		logger.info(
			`Or run a local model: ${chalk.cyan("ollama serve")} / ${chalk.cyan("omlx start")}, then ${chalk.cyan("--agent ollama")} or ${chalk.cyan("--agent omlx")}.`,
		);
		logger.info(`Or use the prompt file manually: ${chalk.cyan(promptFile)}`);
		process.exitCode = 1;
		return;
	}

	const local = isLocalAgent(agent.type);
	agentSpinner.succeed(
		`Agent ready  ${chalk.cyan(agent.type)}  ${chalk.dim(local ? `${options.model ?? agent.model} · ${agent.path}` : agent.path)}`,
	);

	// Only the MCP adapter needs the Figma MCP connection; REST/cache/file don't.
	const usesMcp = resolved.design?.mode === "mcp" || (!resolved.design && provider === "figma");
	if (local && usesMcp) {
		// A local model can't call MCP: it only sees what the CLI sends it.
		logger.error(`A local model can't read a Figma design through MCP.`);
		logger.info(
			chalk.dim(
				`  Set a Figma token (${chalk.cyan("FIGMA_TOKEN")}) so eds fetches it over REST, export the frame as PNG/SVG, or scrape a Framer / Stitch page. Prompt saved: ${promptFile}`,
			),
		);
		process.exitCode = 1;
		return;
	}
	if (usesMcp && provider === "figma" && !agent.hasFigmaMcp) {
		logger.warn(`Figma MCP may not be configured for ${agent.type}.`);
		logger.info(
			`Run ${chalk.cyan("eds figma setup")} to configure it, or set a Figma token for REST.`,
		);
	}

	// Confirm with user unless --yes
	if (!options.yes) {
		const { confirm } = await import("../../lib/prompts.js");
		const proceed = await confirm({
			message: `Run ${agent.type} with the generated prompt?`,
			default: true,
		});
		if (!proceed) {
			logger.info(`Prompt saved to: ${chalk.cyan(promptFile)}`);
			return;
		}
	}

	// Hand off to the agent — describe how it will get the design.
	const handoffVia =
		resolved.design?.mode === "spec"
			? "embedded design (no MCP)"
			: resolved.design?.mode === "scrape"
				? `scraped ${providerName} page (no MCP)`
				: resolved.design?.mode === "file"
					? `reading ${localPromptPath}`
					: resolved.design?.mode === "mcp"
						? `via ${providerName} MCP (1 call, cached)`
						: `via ${providerName} MCP`;
	logger.info(
		`  ${chalk.dim("→")} Handing off to ${chalk.cyan(agent.type)}  ${chalk.dim(handoffVia)}`,
	);
	if (resolved.design?.mode === "mcp") {
		logger.info(chalk.dim("     get_design_context ×1 → cache"));
	}

	// Invoke agent
	// Content Fragment blocks need an async, fetching decorate(); the fast default
	// model tends to ignore that, so default those sources to a stronger one.
	const needsCf = options.source === "cf" || options.source === "mixed";
	const model = local
		? (options.model ?? agent.model)
		: (options.model ??
			config.model ??
			(needsCf && agent.type === "claude" ? "sonnet" : undefined));
	if (model && !local && !options.model && !config.model)
		logger.info(chalk.dim(`  Model: ${model} (Content Fragment source)`));
	const localCtx = {
		blockName,
		designFile: resolved.design?.mode === "file" ? localPromptPath : undefined,
		contextTokens: config.local?.contextTokens,
		apiKey: config.local?.apiKey,
	};
	const success = await invokeAgent(agent, promptFile, projectRoot, model, localCtx);

	if (!success) {
		process.exitCode = 1;
		return;
	}

	const blockDir = path.join(projectRoot, "blocks", blockName);

	// If the agent wrote no code at all, the design fetch almost certainly failed
	// (most often the design MCP's tool-call limit). Say that plainly instead of
	// the generic per-file "missing — agent did not write the JS file" noise.
	const wroteCode =
		existsSync(path.join(blockDir, `${blockName}.js`)) ||
		existsSync(path.join(blockDir, `${blockName}.css`));
	if (!wroteCode) {
		logger.warn(`No block files were written to blocks/${blockName}/ — nothing to preview.`);
		if (resolved.design?.mode === "mcp" && !agent.hasFigmaMcp) {
			// We already warned MCP looked unconfigured - that's the likely cause.
			logger.info(
				chalk.dim(
					`  The agent couldn't read the design: no ${providerName} MCP is configured for ${agent.type}.`,
				),
			);
			logger.info(
				chalk.dim(
					`  Run ${chalk.cyan("eds figma setup")}, or set a Figma token (FIGMA_TOKEN) to use REST, then re-run.`,
				),
			);
		} else if (resolved.design?.mode === "mcp") {
			logger.info(
				chalk.dim(
					`  The agent couldn't read the design, so it generated nothing. Common cause: the`,
				),
			);
			logger.info(
				chalk.dim(
					`  ${providerName} MCP tool-call limit (e.g. Figma Starter plan). See the log above.`,
				),
			);
			logger.info(
				chalk.dim(
					"  Wait for the limit to reset or upgrade the plan, then re-run the same command.",
				),
			);
		} else {
			logger.info(chalk.dim("  The agent generated nothing — see the log above for why."));
		}
		process.exitCode = 1;
		return;
	}

	// Verify what the agent actually produced before declaring success.
	const ok = await verifyGeneratedBlock(
		blockDir,
		blockName,
		options.ueModel !== false,
		options.source ?? "document",
	);

	// Post-process: save .eds-meta.json
	if (existsSync(blockDir)) {
		// Preview widths come from the design's frames. Priority: the `--widths`
		// flag, else any breakpoints the agent recorded while reading the design.
		const metaFile = path.join(blockDir, ".eds-meta.json");
		let prevBreakpoints: unknown;
		if (existsSync(metaFile)) {
			try {
				prevBreakpoints = (
					JSON.parse(await readFile(metaFile, "utf-8")) as { breakpoints?: unknown }
				).breakpoints;
			} catch {
				// ignore an unreadable/partial meta the agent may have left
			}
		}
		const breakpoints = resolveBreakpoints(options.widths, prevBreakpoints);
		const meta = {
			provider,
			designRef,
			figmaFileKey: figma?.fileKey ?? null,
			figmaNodeId: figma?.nodeId ?? null,
			lastSyncedAt: new Date().toISOString(),
			promptVersion: PROMPT_VERSION,
			agentUsed: agent.type,
			...(breakpoints.length ? { breakpoints } : {}),
		};
		await writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
		if (breakpoints.length) {
			logger.info(
				chalk.dim(`  Preview breakpoints: ${breakpoints.map((b) => b.width).join(" · ")}`),
			);
		}
	}

	if (!ok) {
		logger.warn(
			`Block "${blockName}" generated with issues — review the output above before publishing.`,
		);
		process.exitCode = 1;
		return;
	}
	logger.success(`Block "${blockName}" generation complete.`);

	// Optionally instrument the block for analytics (dataLayer) - interactive only.
	if (!options.yes) {
		const { confirm } = await import("../../lib/prompts.js");
		const addTracking = await confirm({
			message: "Instrument this block for analytics (dataLayer)?",
			default: false,
		});
		if (addTracking) {
			const { trackBlock } = await import("../track.js");
			await trackBlock(blockName, {});
		}
	}

	// Human-in-the-loop finish. Interactive runs get a menu to do another round
	// of corrections and to open the live preview **on demand** — generating a
	// block never auto-launches a server. Each refine pass re-runs the agent;
	// if the preview is open, its watcher refreshes the browser. This replaces
	// the old agent-side "pixel-perfect" self-verify loop with a fast first pass
	// plus human-driven corrections.
	if (!options.yes) {
		await refineLoop({
			blockName,
			projectRoot,
			agent,
			model: isLocalAgent(agent.type)
				? (options.model ?? agent.model)
				: (options.model ?? config.model),
			contextTokens: config.local?.contextTokens,
			apiKey: config.local?.apiKey,
			provider,
			figma,
			designRef,
		});
	} else if (options.serve) {
		// Non-interactive run with explicit --serve: start the blocking preview.
		const { previewBlock } = await import("./preview.js");
		await previewBlock(blockName, {});
	} else {
		logger.info(`  ${chalk.dim("→")} Next:  ${chalk.cyan(`eds block preview ${blockName}`)}`);
	}
}

interface RefineLoopContext {
	blockName: string;
	projectRoot: string;
	agent: AgentInfo;
	model?: string;
	contextTokens?: number;
	apiKey?: string;
	provider: DesignProvider;
	figma: FigmaUrlParts | null;
	designRef: string | undefined;
}

/**
 * Post-generation menu: refine the block with another agent pass, open the live
 * preview on demand, or finish. The preview (when opened) stays up in the
 * background so refine passes live-reload the browser; it's only kept alive at
 * the end if the author actually opened it.
 */
async function refineLoop(ctx: RefineLoopContext): Promise<void> {
	const { select, input } = await import("../../lib/prompts.js");
	const { startPreview } = await import("./preview.js");
	let preview: { url: string; close: () => Promise<void> } | null = null;

	logger.info("");
	while (true) {
		const action = await select({
			message: "Block ready — what next?",
			choices: [
				{ name: "Refine — describe a change", value: "refine" },
				{
					name: preview
						? `Preview open at ${preview.url} (reloads on change)`
						: "Open live preview",
					value: "preview",
					disabled: preview ? "running" : false,
				},
				{ name: "Finish", value: "done" },
			],
			default: "refine",
		});

		if (action === "done") break;

		if (action === "preview") {
			if (await previewRunning()) {
				logger.info(chalk.dim("  A preview server is already running at http://127.0.0.1:8777."));
			} else {
				preview = await startPreview(ctx.blockName, {});
			}
			continue;
		}

		// Refine: collect the change and run one more focused agent pass.
		const feedback = (await input({ message: "Describe the change:" })).trim();
		if (!feedback) continue;
		const refinePrompt = buildRefinePrompt({
			blockName: ctx.blockName,
			feedback,
			provider: ctx.provider,
			figma: ctx.figma,
			designRef: ctx.designRef,
		});
		const refineFile = await savePromptToFile(refinePrompt, ctx.projectRoot);
		logger.info(`  ${chalk.dim("→")} Applying your change with ${chalk.cyan(ctx.agent.type)}…`);
		await invokeAgent(ctx.agent, refineFile, ctx.projectRoot, ctx.model, {
			blockName: ctx.blockName,
			refine: true,
			contextTokens: ctx.contextTokens,
			apiKey: ctx.apiKey,
		});
		// If the preview is open, its watcher refreshes the browser automatically.
	}

	// Keep the preview alive only if the author opened one.
	if (preview) {
		const live = preview;
		logger.info(chalk.dim(`  Preview still live at ${live.url}. ${stopHint()}\n`));
		await waitForStop(live.close);
	}
}

/**
 * Sanity-check the files the agent wrote: core files present, JS exports a
 * decorator, CSS is scoped to the block, no stray debug logging. Prints an
 * aligned report and returns false if any hard check fails.
 */
async function verifyGeneratedBlock(
	blockDir: string,
	blockName: string,
	withUeModel: boolean,
	contentSource: ContentSource = "document",
): Promise<boolean> {
	const checks: { status: ui.Status; name: string; message: string }[] = [];
	const jsPath = path.join(blockDir, `${blockName}.js`);
	const cssPath = path.join(blockDir, `${blockName}.css`);

	const hasJs = existsSync(jsPath);
	const hasCss = existsSync(cssPath);
	checks.push({
		status: hasJs ? "pass" : "fail",
		name: `${blockName}.js`,
		message: hasJs ? "created" : "missing — agent did not write the JS file",
	});
	checks.push({
		status: hasCss ? "pass" : "fail",
		name: `${blockName}.css`,
		message: hasCss ? "created" : "missing — agent did not write the CSS file",
	});

	if (hasJs) {
		const js = await readFile(jsPath, "utf-8");
		checks.push({
			status: /export\s+default/.test(js) ? "pass" : "fail",
			name: "decorate export",
			message: /export\s+default/.test(js) ? "found" : "no default export — block won't load",
		});
		if (js.includes("console.log")) {
			checks.push({
				status: "warn",
				name: "no console.log",
				message: "found console.log — remove before production",
			});
		}
	}

	if (hasCss) {
		const css = await readFile(cssPath, "utf-8");
		checks.push({
			status: css.includes(`.${blockName}`) ? "pass" : "warn",
			name: "scoped CSS",
			message: css.includes(`.${blockName}`)
				? `scoped to .${blockName}`
				: `no .${blockName} selector — styles may leak`,
		});
	}

	if (withUeModel) {
		const hasPerBlock = existsSync(path.join(blockDir, `_${blockName}.json`));
		// Accept an aggregated model file that references this block, too.
		const modelsFile = path.join(blockDir, "..", "..", "component-models.json");
		let hasAggregated = false;
		if (!hasPerBlock && existsSync(modelsFile)) {
			try {
				hasAggregated = (await readFile(modelsFile, "utf-8")).includes(`"${blockName}"`);
			} catch {
				// ignore
			}
		}
		const hasModel = hasPerBlock || hasAggregated;
		checks.push({
			status: hasModel ? "pass" : "warn",
			name: "Universal Editor model",
			message: hasModel
				? hasPerBlock
					? `_${blockName}.json created`
					: "added to component-models.json"
				: `missing — no _${blockName}.json (run with default UE generation, or --no-ue-model to skip)`,
		});

		// Multifield guardrail: a repeatable (container) model whose decorate()
		// doesn't iterate block.children will only ever render one item.
		if (hasPerBlock && hasJs) {
			try {
				const modelRaw = await readFile(path.join(blockDir, `_${blockName}.json`), "utf-8");
				const js = await readFile(jsPath, "utf-8");
				const isRepeatable =
					/"resourceType"\s*:\s*"[^"]*\/item"/.test(modelRaw) ||
					/"filter"\s*:/.test(modelRaw) ||
					/"multi"\s*:\s*true/.test(modelRaw);
				const iterates =
					/\.children/.test(js) || /\bfor\s*\(/.test(js) || /\.forEach\s*\(/.test(js);
				if (isRepeatable) {
					checks.push({
						status: iterates ? "pass" : "warn",
						name: "multifield wired",
						message: iterates
							? "decorate() iterates items"
							: "repeatable model but decorate() never iterates block.children — only one item will render",
					});
				}
			} catch {
				// ignore
			}
		}
	}

	// Content Fragment sources: the block must reference a CF and fetch it.
	if ((contentSource === "cf" || contentSource === "mixed") && hasJs) {
		const js = await readFile(jsPath, "utf-8");
		const modelPath = path.join(blockDir, `_${blockName}.json`);
		const model = existsSync(modelPath) ? await readFile(modelPath, "utf-8") : "";
		const hasCfField = model.includes("aem-content-fragment");
		const fetches = /\bfetch\s*\(/.test(js);
		checks.push({
			status: hasCfField && fetches ? "pass" : "warn",
			name: "content fragment",
			message:
				hasCfField && fetches
					? "CF field in the model, fetched in decorate()"
					: [
							!hasCfField && "no aem-content-fragment field in the model",
							!fetches && "decorate() never fetches the fragment",
						]
							.filter(Boolean)
							.join("; "),
		});
	}

	logger.info(ui.heading("Verification"));
	const nameWidth = ui.columnWidth(checks.map((c) => c.name));
	for (const c of checks) {
		logger.info(ui.statusLine(c.status, c.name, c.message, nameWidth));
	}
	logger.info("");

	return !checks.some((c) => c.status === "fail");
}
