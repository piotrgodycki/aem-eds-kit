import chalk from "chalk";

/**
 * Shared presentation layer for the eds CLI.
 *
 * Branding nods to the three worlds this tool bridges: Adobe (the red
 * spectrum accent), Edge Delivery Services, and Figma (the five-colour dot
 * mark). Everything funnels through `chalk`, so `--no-color` (which sets
 * `chalk.level = 0`) transparently strips every style defined here.
 *
 * Figma is the first product surface, but the branding is deliberately
 * generic enough to grow with the roadmap — hence "eds" as the wordmark
 * rather than anything Figma-specific.
 */

// ── Brand palette ──────────────────────────────────────────────

export const brand = {
	adobe: chalk.hex("#FA0F00"), // Adobe red
	spectrum: chalk.hex("#1473E6"), // Adobe Spectrum blue (accent)
	figmaOrange: chalk.hex("#F24E1E"),
	figmaPurple: chalk.hex("#A259FF"),
	figmaBlue: chalk.hex("#1ABCFE"),
	figmaGreen: chalk.hex("#0ACF83"),
	figmaPink: chalk.hex("#FF7262"),
	ok: chalk.hex("#0ACF83"),
	warn: chalk.hex("#F5A623"),
	err: chalk.hex("#FA0F00"),
	info: chalk.hex("#1473E6"),
};

// ── Status icons ───────────────────────────────────────────────

export type Status = "pass" | "warn" | "fail" | "info";

export const icon = {
	pass: brand.ok("✓"),
	warn: brand.warn("⚠"),
	fail: brand.err("✗"),
	info: brand.info("ℹ"),
	bullet: chalk.dim("•"),
	arrow: chalk.dim("↳"),
	figma: brand.figmaPurple("◆"),
};

export function statusIcon(status: Status): string {
	return icon[status];
}

// ── ANSI-aware width helpers ───────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes
const ANSI = /\[[0-9;]*m/g;

/** Visible length of a string, ignoring ANSI colour codes. */
export function visibleLength(s: string): number {
	return s.replace(ANSI, "").length;
}

/** Pad a (possibly coloured) string to a visible width. */
export function padEndVisible(s: string, width: number): string {
	const pad = width - visibleLength(s);
	return pad > 0 ? s + " ".repeat(pad) : s;
}

// ── Building blocks ────────────────────────────────────────────

/**
 * The CLI signature: five Figma-coloured dots, the wordmark, and a tagline.
 * Printed once at the top of long-running / interactive commands.
 */
export function banner(tagline = "AEM Edge Delivery Services"): string {
	const dots = [
		brand.figmaOrange("●"),
		brand.figmaPink("●"),
		brand.figmaPurple("●"),
		brand.figmaBlue("●"),
		brand.figmaGreen("●"),
	].join(" ");
	const wordmark = chalk.bold(brand.adobe("eds"));
	return `\n  ${dots}  ${wordmark} ${chalk.dim("·")} ${chalk.dim(tagline)}\n`;
}

/**
 * The full EDS wordmark — block-letter art with an Adobe→Figma colour sweep,
 * the five-dot Figma mark, and a tagline. Use at the top of entry points
 * (help, setup wizard, the Figma flow) where a strong signature earns its
 * vertical space; prefer the compact {@link banner} inside routine commands.
 */
export function logo(tagline = "AEM Edge Delivery × Figma"): string {
	const E = ["█▀▀", "█▀▀", "█▄▄"];
	const D = ["█▀▄", "█ █", "█▄▀"];
	const S = ["▄▀▀", "▀▀▄", "▄▄▀"];
	const rows = [0, 1, 2]
		.map((i) => `  ${brand.adobe(E[i])} ${brand.spectrum(D[i])} ${brand.figmaPurple(S[i])}`)
		.join("\n");
	const dots = [
		brand.figmaOrange("●"),
		brand.figmaPink("●"),
		brand.figmaPurple("●"),
		brand.figmaBlue("●"),
		brand.figmaGreen("●"),
	].join(" ");
	return `\n${rows}\n\n  ${dots}  ${chalk.dim(tagline)}\n`;
}

/** A section heading with an Adobe-red accent bar. */
export function heading(title: string, subtitle?: string): string {
	const bar = brand.adobe("▊");
	const sub = subtitle ? ` ${chalk.dim(subtitle)}` : "";
	return `\n${bar} ${chalk.bold(title)}${sub}\n`;
}

/** A dimmed horizontal rule. */
export function divider(width = 56): string {
	return chalk.dim("─".repeat(width));
}

/** A `label: value` row with the label dimmed. */
export function kv(label: string, value: string, labelWidth = 0): string {
	const l = chalk.dim(`${label}`);
	const padded = labelWidth ? padEndVisible(l, labelWidth) : l;
	return `  ${padded}  ${value}`;
}

/**
 * A single status line: icon, name (padded to a shared column), then a
 * dimmed message. Pass `nameWidth` from `columnWidth(names)` to align a list.
 */
export function statusLine(status: Status, name: string, message?: string, nameWidth = 0): string {
	const padded = nameWidth ? padEndVisible(name, nameWidth) : name;
	const msg = message ? `  ${chalk.dim(message)}` : "";
	return `  ${icon[status]} ${padded}${msg}`;
}

/** Widest visible length in a list of strings — use for column alignment. */
export function columnWidth(items: string[]): number {
	return items.reduce((max, s) => Math.max(max, visibleLength(s)), 0);
}

/**
 * A rounded box around pre-formatted lines. Used for end-of-command summaries.
 * `accent` colours the border (defaults to Adobe red).
 */
export function box(lines: string[], accent = brand.adobe): string {
	const inner = columnWidth(lines);
	const top = accent(`╭${"─".repeat(inner + 2)}╮`);
	const bot = accent(`╰${"─".repeat(inner + 2)}╯`);
	const body = lines
		.map((l) => `${accent("│")} ${padEndVisible(l, inner)} ${accent("│")}`)
		.join("\n");
	return `${top}\n${body}\n${bot}`;
}

/**
 * A tallied summary line like `✓ 12 passed   ⚠ 3 warnings   ✗ 1 failed`.
 * Zero-count segments are omitted.
 */
export function summary(counts: {
	pass?: number;
	warn?: number;
	fail?: number;
	info?: number;
}): string {
	const parts: string[] = [];
	if (counts.pass) parts.push(`${icon.pass} ${counts.pass} passed`);
	if (counts.warn) parts.push(`${icon.warn} ${counts.warn} ${plural(counts.warn, "warning")}`);
	if (counts.fail) parts.push(`${icon.fail} ${counts.fail} failed`);
	if (counts.info) parts.push(`${icon.info} ${counts.info} info`);
	return parts.join(chalk.dim("   "));
}

function plural(n: number, word: string): string {
	return n === 1 ? word : `${word}s`;
}
