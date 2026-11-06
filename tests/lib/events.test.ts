import { afterEach, describe, expect, it, vi } from "vitest";

/** Collect the JSON lines written to stdout while `fn` runs. */
async function capture(fn: () => Promise<void> | void) {
	const lines: string[] = [];
	const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		lines.push(String(chunk));
		return true;
	});
	const err = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await fn();
	} finally {
		spy.mockRestore();
		err.mockRestore();
	}
	return lines
		.join("")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

describe("--json event stream", () => {
	afterEach(() => {
		vi.resetModules();
	});

	it("is silent until enabled", async () => {
		const { events } = await import("../../src/lib/events.js");
		expect(await capture(() => events.emit({ type: "discarded", name: "hero" }))).toEqual([]);
	});

	it("writes one versioned JSON object per line", async () => {
		const { events } = await import("../../src/lib/events.js");
		events.enable();
		const out = await capture(() => {
			events.emit({ type: "start", command: "draft list", cli: "0.0.0" });
			events.emit({ type: "result", ok: true, exitCode: 0 });
		});
		expect(out).toEqual([
			{ v: 1, type: "start", command: "draft list", cli: "0.0.0" },
			{ v: 1, type: "result", ok: true, exitCode: 0 },
		]);
	});

	it("mirrors log lines as plain text and skips blank ones", async () => {
		const { events } = await import("../../src/lib/events.js");
		const { logger } = await import("../../src/lib/logger.js");
		const chalk = (await import("chalk")).default;
		events.enable();
		const prev = chalk.level;
		chalk.level = 1;
		const out = await capture(() => {
			logger.info("");
			logger.success(chalk.green("Draft"), chalk.cyan("hero"), "v2 ready");
			logger.warn("careful");
			logger.debug("hidden at the default level");
		});
		chalk.level = prev;
		expect(out).toEqual([
			{ v: 1, type: "log", level: "success", message: "Draft hero v2 ready" },
			{ v: 1, type: "log", level: "warn", message: "careful" },
		]);
	});
});
