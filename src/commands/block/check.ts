import chalk from "chalk";
import { logger } from "../../lib/logger.js";
import { auditRoute } from "../../lib/preview/content-check.js";
import { findProjectRoot } from "../../lib/project.js";
import * as ui from "../../lib/ui.js";
import {
	FRAME_PREFIX,
	listPreviewableBlocks,
	loadBlockForPreview,
	startFrameServer,
} from "./preview.js";

interface CheckOptions {
	widths?: string;
	port?: string;
	/** Fail (exit non-zero) on warnings too, not just errors. */
	strict?: boolean;
}

/**
 * Content / link / a11y check: render each block (after decorate) and flag
 * missing image alt, missing image dimensions (CLS), links/buttons with no
 * accessible name, empty hrefs and inline handlers. No name → all blocks.
 * Exits non-zero on any error (or any warning with --strict).
 */
export async function blockCheck(
	name: string | undefined,
	options: CheckOptions = {},
): Promise<void> {
	const projectRoot = findProjectRoot();
	if (!projectRoot) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}

	const names = name ? [name] : await listPreviewableBlocks(projectRoot);
	if (!names.length) {
		logger.warn("No previewable blocks to check.");
		return;
	}

	const port = Number.parseInt(options.port ?? "8789", 10);
	const server = await startFrameServer(
		projectRoot,
		options.widths,
		Number.isFinite(port) ? port : 8789,
	);

	logger.logoOnce(ui.logo("Content check"));
	let errors = 0;
	let warnings = 0;
	let clean = 0;

	try {
		for (const n of names) {
			const b = await loadBlockForPreview(projectRoot, n, options.widths);
			if (!b) continue;
			// The widest breakpoint is enough for content / a11y / CLS checks.
			const width = b.breakpoints.reduce(
				(m, x) => (x.width > m.width ? x : m),
				b.breakpoints[0],
			).width;
			const findings = await auditRoute(
				`${server.url}${FRAME_PREFIX.slice(1)}${n}`,
				width,
				b.placeholder ? undefined : b.sampleContent,
			);

			logger.info(ui.heading(n, `${width}px`));
			if (!findings.length) {
				clean++;
				logger.info(ui.statusLine("pass", "clean", "no issues"));
				continue;
			}
			for (const f of findings) {
				if (f.level === "error") errors++;
				else warnings++;
				logger.info(ui.statusLine(f.level === "error" ? "fail" : "warn", f.rule, f.detail));
			}
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
		return;
	} finally {
		await server.close();
	}

	logger.info("");
	logger.info(
		`${chalk.green(`${clean} clean`)} · ${chalk.red(`${errors} error(s)`)} · ${chalk.yellow(`${warnings} warning(s)`)}`,
	);
	if (errors > 0 || (options.strict && warnings > 0)) process.exitCode = 1;
}
