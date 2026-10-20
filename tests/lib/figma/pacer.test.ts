import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireRestSlot } from "../../../src/lib/figma/pacer.js";

describe("acquireRestSlot (Figma REST pacing)", () => {
	let dir: string;
	let logPath: string;
	let clock: number;
	const waits: number[] = [];
	const opts = (perMinute: number) => ({
		logPath,
		perMinute,
		now: () => clock,
		sleep: async (ms: number) => {
			waits.push(ms);
			clock += ms; // the fake clock moves while we "wait"
		},
	});

	beforeEach(async () => {
		dir = await mkdtemp(path.join(tmpdir(), "eds-pacer-"));
		logPath = path.join(dir, "tmp", "eds-cli", "figma-rest-calls.json");
		clock = 1_000_000;
		waits.length = 0;
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("lets calls through while the minute has room", async () => {
		for (let i = 0; i < 3; i++) {
			await acquireRestSlot(opts(3));
			clock += 1000;
		}
		expect(waits).toEqual([]);
		expect(JSON.parse(await readFile(logPath, "utf-8"))).toHaveLength(3);
	});

	it("waits for the oldest call to leave the 60 s window", async () => {
		for (let i = 0; i < 3; i++) {
			await acquireRestSlot(opts(3));
			clock += 1000;
		}
		await acquireRestSlot(opts(3)); // 3 s after the first: wait ~57 s
		expect(waits).toEqual([57_050]);
	});

	it("serialises concurrent callers through the shared log", async () => {
		await Promise.all(Array.from({ length: 5 }, () => acquireRestSlot(opts(5))));
		expect(JSON.parse(await readFile(logPath, "utf-8"))).toHaveLength(5);
		expect(existsSync(`${logPath}.lock`)).toBe(false);
	});

	it("clears a stale lock left by a crashed run", async () => {
		await mkdir(`${logPath}.lock`, { recursive: true });
		const old = new Date(Date.now() - 60_000);
		await utimes(`${logPath}.lock`, old, old);
		await acquireRestSlot({ ...opts(3), now: Date.now });
		expect(existsSync(`${logPath}.lock`)).toBe(false);
	});
});
