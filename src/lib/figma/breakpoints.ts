/**
 * Design breakpoints recorded in a block's `.eds-meta.json`. They drive the
 * width-honest `eds block preview`: the widths come from the design's own frame
 * sizes (marked `source: "figma"` → pixel-perfect), not a fixed device set.
 */

export interface MetaBreakpoint {
	width: number;
	label?: string;
	source?: "figma" | "default";
}

/** Human label for a width, bucketed into mobile / tablet / desktop. */
export function labelFor(width: number): string {
	if (width <= 480) return `${width} mobile`;
	if (width <= 1024) return `${width} tablet`;
	return `${width} desktop`;
}

/** Parse a comma-separated width list (e.g. "390,768,1440"); invalid parts dropped. */
export function parseWidths(
	flag: string | undefined,
	source: "figma" | "default" = "figma",
): MetaBreakpoint[] {
	if (!flag) return [];
	return flag
		.split(",")
		.map((w) => Number.parseInt(w.trim(), 10))
		.filter((w) => Number.isFinite(w) && w > 0)
		.map((width) => ({ width, label: labelFor(width), source }));
}

/**
 * Final preview breakpoints for a generated block: the explicit `--widths`
 * flag wins; otherwise keep whatever the agent recorded in `.eds-meta.json`.
 */
export function resolveBreakpoints(
	widthsFlag: string | undefined,
	existing: unknown,
): MetaBreakpoint[] {
	const flagged = parseWidths(widthsFlag, "figma");
	return flagged.length ? flagged : normalizeBreakpoints(existing);
}

/** Validate/normalise breakpoints an agent may have written into `.eds-meta.json`. */
export function normalizeBreakpoints(value: unknown): MetaBreakpoint[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<number>();
	const out: MetaBreakpoint[] = [];
	for (const b of value) {
		const width = Number((b as { width?: unknown })?.width);
		if (!Number.isFinite(width) || width <= 0 || seen.has(width)) continue;
		seen.add(width);
		const src = (b as { source?: unknown }).source;
		out.push({ width, label: labelFor(width), source: src === "figma" ? "figma" : "default" });
	}
	return out;
}
