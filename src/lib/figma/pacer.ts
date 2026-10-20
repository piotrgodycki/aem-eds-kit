import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Client-side pacing for Figma REST calls. Tier 1 endpoints allow 10/15/20 calls
 * a minute with a Dev/Full seat (Professional/Organization/Enterprise), and each
 * `eds` run is its own process - so a batch of blocks generated in parallel
 * shares a call log on disk (one per project) and waits for a free slot instead
 * of tripping a 429. Best effort: a crashed run can only leave a stale lock,
 * which is cleared after a few seconds.
 */

/** Tier 1 Dev/Full limit on a Professional plan - the smallest paid default. */
export const DEFAULT_REST_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
const STALE_LOCK_MS = 10_000;

export interface PacerOptions {
	/** The shared call log (JSON array of call timestamps, ms). */
	logPath: string;
	/** Calls allowed in any 60 s window. */
	perMinute?: number;
	/** Told how long a call will wait, before it waits. */
	onWait?: (ms: number) => void;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

/** The project's call log. */
export function restCallLogPath(projectRoot: string): string {
	return path.join(projectRoot, "tmp", "eds-cli", "figma-rest-calls.json");
}

async function withLock<T>(logPath: string, now: () => number, fn: () => Promise<T>): Promise<T> {
	const lock = `${logPath}.lock`;
	await mkdir(path.dirname(logPath), { recursive: true });
	for (;;) {
		try {
			await mkdir(lock); // atomic: only one process gets it
			break;
		} catch {
			const age = await stat(lock).then(
				(s) => now() - s.mtimeMs,
				() => 0,
			);
			if (age > STALE_LOCK_MS) await rm(lock, { recursive: true, force: true });
			else await new Promise((r) => setTimeout(r, 25));
		}
	}
	try {
		return await fn();
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

async function readLog(logPath: string): Promise<number[]> {
	try {
		const v = JSON.parse(await readFile(logPath, "utf-8"));
		return Array.isArray(v) ? v.filter((t): t is number => typeof t === "number") : [];
	} catch {
		return [];
	}
}

/** Wait until a REST call fits in the per-minute budget, then record it. */
export async function acquireRestSlot(opts: PacerOptions): Promise<void> {
	const perMinute = Math.max(1, opts.perMinute ?? DEFAULT_REST_PER_MINUTE);
	const now = opts.now ?? Date.now;
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	for (;;) {
		const wait = await withLock(opts.logPath, now, async () => {
			const t = now();
			const recent = (await readLog(opts.logPath)).filter((c) => t - c < WINDOW_MS);
			if (recent.length < perMinute) {
				recent.push(t);
				await writeFile(opts.logPath, JSON.stringify(recent));
				return 0;
			}
			return Math.min(...recent) + WINDOW_MS - t + 50;
		});
		if (wait <= 0) return;
		opts.onWait?.(wait);
		await sleep(wait);
	}
}
