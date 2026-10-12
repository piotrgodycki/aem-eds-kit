/**
 * Figma REST API adapter — the quota-separate "scrape" path.
 *
 * The Dev Mode **MCP** server meters tool calls per Figma plan (Starter: a
 * handful per month). The **REST** API is a different product with its own,
 * far larger per-token budget and works on every plan. So instead of the agent
 * calling MCP mid-generation, the CLI fetches the node here, normalizes it to a
 * compact "design spec", and hands that to the agent — no MCP touched.
 */

const FIGMA_API = "https://api.figma.com/v1";

export interface FigmaRestOptions {
	fileKey: string;
	nodeId?: string;
	/** Figma Personal Access Token (scope: file_content:read). */
	token: string;
}

/** Fetch a node (or the whole file) via the Figma REST API. Returns raw JSON. */
export async function fetchFigmaNode(opts: FigmaRestOptions): Promise<unknown> {
	const { fileKey, nodeId, token } = opts;
	const url = nodeId
		? `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
		: `${FIGMA_API}/files/${fileKey}`;

	const res = await fetch(url, { headers: { "X-Figma-Token": token } });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		const hint =
			res.status === 403
				? " (check the token scope: it needs file_content:read, and access to this file)"
				: res.status === 404
					? " (file or node not found — check the URL)"
					: "";
		throw new Error(
			`Figma REST ${res.status} ${res.statusText}${hint}${body ? ` — ${body.slice(0, 200)}` : ""}`,
		);
	}
	return res.json();
}

/**
 * Render a Figma node to a PNG via the REST images endpoint and return the
 * image bytes. Used for the design↔render pixel diff. Requires a node id.
 */
export async function fetchFigmaImage(
	opts: FigmaRestOptions & { scale?: number },
): Promise<Buffer> {
	const { fileKey, nodeId, token, scale = 1 } = opts;
	if (!nodeId) throw new Error("A node id is required to render a Figma image.");

	const metaUrl = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`;
	const res = await fetch(metaUrl, { headers: { "X-Figma-Token": token } });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(
			`Figma images ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
		);
	}
	const data = (await res.json()) as { images?: Record<string, string | null>; err?: string };
	if (data.err) throw new Error(`Figma images: ${data.err}`);
	const url = data.images?.[nodeId] ?? Object.values(data.images ?? {}).find(Boolean);
	if (!url) throw new Error("Figma returned no image URL for that node.");

	const img = await fetch(url);
	if (!img.ok)
		throw new Error(`Fetching the rendered image failed: ${img.status} ${img.statusText}`);
	return Buffer.from(await img.arrayBuffer());
}

// ── Normalisation: raw Figma node JSON → compact design spec ──────────────────

interface RawNode {
	id?: string;
	name?: string;
	type?: string;
	characters?: string;
	style?: Record<string, unknown>;
	absoluteBoundingBox?: { width?: number; height?: number };
	layoutMode?: string;
	itemSpacing?: number;
	paddingLeft?: number;
	paddingRight?: number;
	paddingTop?: number;
	paddingBottom?: number;
	primaryAxisAlignItems?: string;
	counterAxisAlignItems?: string;
	cornerRadius?: number;
	fills?: RawPaint[];
	strokes?: RawPaint[];
	strokeWeight?: number;
	effects?: RawEffect[];
	children?: RawNode[];
}
interface RawPaint {
	type?: string;
	visible?: boolean;
	opacity?: number;
	color?: { r: number; g: number; b: number; a?: number };
	gradientStops?: { color: { r: number; g: number; b: number; a?: number }; position: number }[];
}
interface RawEffect {
	type?: string;
	visible?: boolean;
	radius?: number;
	offset?: { x: number; y: number };
	color?: { r: number; g: number; b: number; a?: number };
}

const MAX_DEPTH = 12;
const MAX_CHILDREN = 60;

function hex(c?: { r: number; g: number; b: number; a?: number }): string | undefined {
	if (!c) return undefined;
	const to = (n: number) =>
		Math.round(Math.max(0, Math.min(1, n)) * 255)
			.toString(16)
			.padStart(2, "0");
	const base = `#${to(c.r)}${to(c.g)}${to(c.b)}`;
	return c.a !== undefined && c.a < 1 ? `${base}${to(c.a)}` : base;
}

function paint(p?: RawPaint[]): string | undefined {
	const first = p?.find((x) => x.visible !== false);
	if (!first) return undefined;
	if (first.type === "SOLID") return hex(first.color);
	if (first.type?.startsWith("GRADIENT")) {
		const stops = (first.gradientStops ?? []).map((s) => hex(s.color)).filter(Boolean);
		return stops.length ? `gradient(${stops.join(" → ")})` : "gradient";
	}
	if (first.type === "IMAGE") return "image(placeholder)";
	return first.type?.toLowerCase();
}

/** Recursively trim a Figma node to the values that matter for codegen. */
function trim(node: RawNode, depth: number): Record<string, unknown> | null {
	if (!node || typeof node !== "object") return null;
	const out: Record<string, unknown> = { name: node.name, type: node.type };

	if (node.absoluteBoundingBox) {
		const { width, height } = node.absoluteBoundingBox;
		if (width != null && height != null) out.size = { w: Math.round(width), h: Math.round(height) };
	}
	if (node.layoutMode && node.layoutMode !== "NONE") {
		out.layout = {
			direction: node.layoutMode === "HORIZONTAL" ? "row" : "column",
			gap: node.itemSpacing,
			padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
			align: [node.primaryAxisAlignItems, node.counterAxisAlignItems].filter(Boolean).join("/"),
		};
	}
	const fill = paint(node.fills);
	if (fill) out.fill = fill;
	const stroke = paint(node.strokes);
	if (stroke) out.stroke = { color: stroke, weight: node.strokeWeight };
	if (node.cornerRadius) out.radius = node.cornerRadius;

	const shadows = (node.effects ?? [])
		.filter((e) => e.visible !== false && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW"))
		.map((e) =>
			`${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset?.x ?? 0} ${e.offset?.y ?? 0} ${e.radius ?? 0} ${hex(e.color) ?? ""}`.trim(),
		);
	if (shadows.length) out.shadows = shadows;

	if (node.type === "TEXT" && node.characters !== undefined) {
		out.text = node.characters;
		const s = node.style ?? {};
		out.font = {
			family: s.fontFamily,
			size: s.fontSize,
			weight: s.fontWeight,
			lineHeight: s.lineHeightPx,
			letterSpacing: s.letterSpacing,
			align: s.textAlignHorizontal,
		};
	}

	if (node.children?.length && depth < MAX_DEPTH) {
		const kids = node.children
			.slice(0, MAX_CHILDREN)
			.map((c) => trim(c, depth + 1))
			.filter(Boolean);
		if (kids.length) out.children = kids;
		if (node.children.length > MAX_CHILDREN) out.childrenTruncated = node.children.length;
	}
	return out;
}

/**
 * Normalize the raw REST response (from `fetchFigmaNode`) into a compact JSON
 * string: the target node's trimmed tree. Vector geometry and other noise are
 * dropped so the spec stays small enough to embed in the prompt.
 */
export function serializeDesign(raw: unknown, nodeId?: string): string {
	const r = raw as {
		nodes?: Record<string, { document?: RawNode }>;
		document?: RawNode;
		name?: string;
	};

	let root: RawNode | undefined;
	if (nodeId && r.nodes) {
		// The nodes endpoint keys by the id with a ":" (the URL uses "-").
		const key = Object.keys(r.nodes)[0];
		root = key ? r.nodes[key]?.document : undefined;
	}
	root ??= r.document;
	if (!root) throw new Error("Figma REST response had no document node to serialize.");

	const spec = { source: "figma-rest", file: r.name, root: trim(root, 0) };
	return JSON.stringify(spec, null, 2);
}
