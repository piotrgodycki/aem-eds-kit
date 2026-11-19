/**
 * Core Web Vitals from the site's RUM bundles (Operational Telemetry), as the
 * RUM Explorer counts them: each bundle is one sampled page view whose `weight`
 * is the number of page views it stands for. A bundle's LCP and CLS are its
 * largest `cwv-lcp` / `cwv-cls` values and its INP its `cwv-inp` (ms for LCP
 * and INP, no unit for CLS), and the thresholds are Google's.
 */

interface RumEvent {
	checkpoint: string;
	value?: number;
	/** What the event happened on, as a CSS selector, e.g. ".hero" or ".cards a". */
	source?: string;
}
export interface RumBundle {
	url: string;
	userAgent?: string;
	weight: number;
	events: RumEvent[];
}

type Metric = "lcp" | "inp" | "cls";
export type Device = "mobile" | "desktop" | "all";

/** Good up to the first number, poor above the second. */
export const THRESHOLDS: Record<Metric, [number, number]> = {
	lcp: [2500, 4000],
	inp: [200, 500],
	cls: [0.1, 0.25],
};

interface MetricSummary {
	/** The 75th percentile, weighted by page views; null without measurements. */
	p75: number | null;
	/** Shares of page views, 0 to 1. */
	good: number;
	ni: number;
	poor: number;
}

interface RumSummary {
	pageViews: number;
	lcp: MetricSummary;
	inp: MetricSummary;
	cls: MetricSummary;
	/** The pages with the most to fix first: at most 10, by how poor and how visited. */
	pages: Array<{
		path: string;
		views: number;
		lcp: number | null;
		inp: number | null;
		cls: number | null;
	}>;
}

interface Measured {
	path: string;
	weight: number;
	lcp?: number;
	inp?: number;
	cls?: number;
}

/** One bundle's values, as rum-distiller reads them. */
function measure(b: RumBundle): Measured {
	const m: Measured = { path: pathOf(b.url), weight: b.weight || 1 };
	for (const e of b.events ?? []) {
		if (typeof e.value !== "number") continue;
		if (e.checkpoint === "cwv-lcp") m.lcp = Math.max(e.value, m.lcp ?? 0);
		else if (e.checkpoint === "cwv-cls") m.cls = Math.max(e.value, m.cls ?? 0);
		else if (e.checkpoint === "cwv-inp") m.inp = e.value;
	}
	return m;
}

function pathOf(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

/** The weighted 75th percentile. */
export function p75(values: Array<{ value: number; weight: number }>): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a.value - b.value);
	const total = sorted.reduce((s, v) => s + v.weight, 0);
	let seen = 0;
	for (const v of sorted) {
		seen += v.weight;
		if (seen >= total * 0.75) return v.value;
	}
	return sorted[sorted.length - 1].value;
}

function summarize(rows: Measured[], metric: Metric): MetricSummary {
	const values = rows
		.filter((r) => typeof r[metric] === "number")
		.map((r) => ({ value: r[metric] as number, weight: r.weight }));
	const total = values.reduce((s, v) => s + v.weight, 0);
	const [good, poor] = THRESHOLDS[metric];
	const share = (test: (v: number) => boolean) =>
		total ? values.filter((v) => test(v.value)).reduce((s, v) => s + v.weight, 0) / total : 0;
	return {
		p75: p75(values),
		good: share((v) => v <= good),
		ni: share((v) => v > good && v <= poor),
		poor: share((v) => v > poor),
	};
}

/** How bad a page is, for the order of "pages to look at": its metrics past "good", by views. */
function badness(p: RumSummary["pages"][number]): number {
	const over = (v: number | null, m: Metric) =>
		v === null ? 0 : Math.max(0, v / THRESHOLDS[m][0] - 1);
	return (over(p.lcp, "lcp") + over(p.inp, "inp") + over(p.cls, "cls")) * Math.log10(p.views + 10);
}

function deviceOf(userAgent?: string): Exclude<Device, "all"> | "other" {
	if (userAgent?.startsWith("mobile")) return "mobile";
	if (userAgent?.startsWith("desktop")) return "desktop";
	return "other";
}

export function summarizeRum(bundles: RumBundle[], device: Device): RumSummary {
	const rows = bundles
		.filter((b) => device === "all" || deviceOf(b.userAgent) === device)
		.map(measure);
	const byPath = new Map<string, Measured[]>();
	for (const r of rows) byPath.set(r.path, [...(byPath.get(r.path) ?? []), r]);
	const pages = [...byPath].map(([path, list]) => ({
		path,
		views: list.reduce((s, r) => s + r.weight, 0),
		lcp: summarize(list, "lcp").p75,
		inp: summarize(list, "inp").p75,
		cls: summarize(list, "cls").p75,
	}));
	return {
		pageViews: rows.reduce((s, r) => s + r.weight, 0),
		lcp: summarize(rows, "lcp"),
		inp: summarize(rows, "inp"),
		cls: summarize(rows, "cls"),
		pages: pages
			.filter((p) => badness(p) > 0)
			.sort((a, b) => badness(b) - badness(a))
			.slice(0, 10),
	};
}

/** The bundles API: one day of a domain's bundles. */
export function bundlesUrl(host: string, domain: string, day: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${host.replace(/\/$/, "")}/bundles/${encodeURIComponent(domain)}/${day.getUTCFullYear()}/${pad(day.getUTCMonth() + 1)}/${pad(day.getUTCDate())}`;
}

/** The bundles API. Override with EDS_RUM_HOST when Adobe serves it elsewhere. */
const DEFAULT_HOST = "https://bundles.aem.page";

/**
 * The domain's bundles for the last `days` days. `refused` says the key was turned
 * down, so a caller can tell a wrong key from a quiet site.
 */
export async function fetchBundles(
	domain: string,
	key: string,
	days: number,
): Promise<{ bundles: RumBundle[]; refused: boolean }> {
	const host = process.env.EDS_RUM_HOST || DEFAULT_HOST;
	const today = new Date();
	const dates = Array.from({ length: days }, (_, i) => new Date(today.getTime() - i * 86_400_000));
	let refused = false;
	const bundles: RumBundle[] = [];
	await Promise.all(
		dates.map(async (day) => {
			const url = `${bundlesUrl(host, domain, day)}?domainkey=${encodeURIComponent(key)}`;
			try {
				const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
				if (res.status === 401 || res.status === 403) refused = true;
				if (!res.ok) return;
				const body = (await res.json()) as { rumBundles?: RumBundle[] };
				bundles.push(...(body.rumBundles ?? []));
			} catch {
				// a day that can't be read counts as no data
			}
		}),
	);
	return { bundles, refused };
}
