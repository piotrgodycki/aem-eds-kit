import chalk from "chalk";

/**
 * Shared presentation layer for the eds CLI.
 *
 * The CLI's own visual identity: a warm red→orange wordmark, a blue accent,
 * and a five-colour dot mark. Everything funnels through `chalk`, so
 * `--no-color` (which sets `chalk.level = 0`) transparently strips every
 * style defined here.
 */

// ── Brand palette ──────────────────────────────────────────────
//
// The CLI's own palette: a warm red→orange sweep for the wordmark, a blue
// accent, and a five-colour dot mark for the signature. Names are neutral -
// the product's identity is its own.

export const brand = {
	// Warm sweep for the logo wordmark (red → ember → orange)
	red: chalk.hex("#FA0F00"),
	ember: chalk.hex("#FF4B1F"),
	orange: chalk.hex("#FF7B00"),
	// Accent
	blue: chalk.hex("#2680EB"),
	// Signature accent (matches the landing's `#FF5A36`)
	accent: chalk.hex("#ff5a36"),
	// Five-colour dot mark (the CLI signature)
	dotOrange: chalk.hex("#F24E1E"),
	dotPurple: chalk.hex("#A259FF"),
	dotBlue: chalk.hex("#1ABCFE"),
	dotGreen: chalk.hex("#0ACF83"),
	dotPink: chalk.hex("#FF7262"),
	// Semantic roles
	ok: chalk.hex("#2D9D78"),
	warn: chalk.hex("#E68619"),
	err: chalk.hex("#D7373F"),
	info: chalk.hex("#2680EB"),
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
	figma: brand.dotPurple("◆"),
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
/**
 * The `>_` brand mark - a dark glyph on a warm tile. Matches the landing's
 * logo lockup so the CLI and the site read as the same product. With
 * `--no-color` chalk strips the tile and it degrades to plain ` >_ `.
 */
export function mark(): string {
	return chalk.bgHex("#ff5a36").hex("#0d0d0c").bold(" >_ ");
}

/** Compact brand lockup: the `>_` tile, the wordmark, and the maker credit. */
export function lockup(): string {
	return `${mark()} ${chalk.bold("aem-eds-kit")} ${chalk.dim("by Piotr Godycki")}`;
}

export function banner(tagline = "AEM Edge Delivery Services"): string {
	const dots = [
		brand.dotOrange("●"),
		brand.dotPink("●"),
		brand.dotPurple("●"),
		brand.dotBlue("●"),
		brand.dotGreen("●"),
	].join(" ");
	return `\n  ${lockup()}   ${dots}  ${chalk.dim(tagline)}\n`;
}

// ── Truecolor gradient helpers (for the ANSI art logo) ─────────

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		Number.parseInt(h.slice(0, 2), 16),
		Number.parseInt(h.slice(2, 4), 16),
		Number.parseInt(h.slice(4, 6), 16),
	];
}

function mix(a: string, b: string, t: number): string {
	const [ar, ag, ab] = hexToRgb(a);
	const [br, bg, bb] = hexToRgb(b);
	const r = Math.round(ar + (br - ar) * t);
	const g = Math.round(ag + (bg - ag) * t);
	const bl = Math.round(ab + (bb - ab) * t);
	return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Colour each visible column of a line along a multi-stop gradient. */
function gradientLine(line: string, stops: string[], width: number): string {
	const chars = [...line];
	const span = Math.max(width - 1, 1);
	return chars
		.map((ch, i) => {
			if (ch === " ") return ch;
			const seg = (i / span) * (stops.length - 1);
			const idx = Math.min(Math.floor(seg), stops.length - 2);
			return chalk.hex(mix(stops[idx], stops[idx + 1], seg - idx))(ch);
		})
		.join("");
}

// Bold 5-row block wordmark "EDS".
const LOGO_ART = [
	"█████ ████  █████",
	"█     █   █ █    ",
	"████  █   █ █████",
	"█     █   █     █",
	"█████ ████  █████",
];
// Warm sweep, applied column-by-column for a smooth truecolor gradient.
const LOGO_STOPS = ["#FA0F00", "#FF4B1F", "#FF7B00"];

/**
 * The full EDS wordmark — bold block-letter ANSI art with a smooth truecolor
 * warm sweep, the five-dot mark, and a tagline. Use at the top of entry
 * points (help, setup wizard, the Figma / security flows) where a strong
 * signature earns its vertical space; prefer the compact {@link banner} inside
 * routine commands. Degrades gracefully: with `--no-color` the art prints as
 * plain blocks.
 */
export function logo(tagline = "AEM Edge Delivery × Figma"): string {
	const width = columnWidth(LOGO_ART);
	const art = LOGO_ART.map((row) => `  ${gradientLine(row, LOGO_STOPS, width)}`).join("\n");
	const dots = [
		brand.dotOrange("●"),
		brand.dotPink("●"),
		brand.dotPurple("●"),
		brand.dotBlue("●"),
		brand.dotGreen("●"),
	].join(" ");
	return `\n${art}\n\n  ${lockup()}   ${dots}  ${chalk.dim(tagline)}\n`;
}

/** A section heading with a red accent bar. */
export function heading(title: string, subtitle?: string): string {
	const bar = brand.red("▊");
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

/**
 * A summary line with the brand-accent `✔` (matches the landing page), rather
 * than the semantic green pass tick. Use for wizard summaries / brand moments.
 */
export function accentLine(name: string, message?: string, nameWidth = 0): string {
	const padded = nameWidth ? padEndVisible(name, nameWidth) : name;
	const msg = message ? `  ${chalk.dim(message)}` : "";
	return `  ${brand.accent("✔")} ${padded}${msg}`;
}

/** Widest visible length in a list of strings — use for column alignment. */
export function columnWidth(items: string[]): number {
	return items.reduce((max, s) => Math.max(max, visibleLength(s)), 0);
}

/**
 * A rounded box around pre-formatted lines. Used for end-of-command summaries.
 * `accent` colours the border (defaults to red).
 */
export function box(lines: string[], accent = brand.red): string {
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
