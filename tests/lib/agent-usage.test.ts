import { describe, expect, it } from "vitest";
import { limitsFromRateEvent, tokensFromResult } from "../../src/lib/agents/invoke.js";

describe("usage from Claude Code's stream", () => {
	it("reads the tokens of the final result", () => {
		expect(
			tokensFromResult({
				type: "result",
				usage: {
					input_tokens: 1200,
					output_tokens: 3400,
					cache_read_input_tokens: 50000,
					cache_creation_input_tokens: 800,
				},
			}),
		).toEqual({ input: 1200, output: 3400, cacheRead: 50000, cacheWrite: 800 });
		expect(tokensFromResult({ type: "result" })).toBeUndefined();
	});

	it("turns every window of a rate_limit_event into a percent with its reset time", () => {
		expect(
			limitsFromRateEvent({
				status: "allowed",
				rateLimitType: "five_hour",
				utilization: 0.42,
				unifiedWindows: {
					five_hour: { utilization: 0.42, resetsAt: 1794500000, status: "allowed" },
					seven_day: { utilization: 0.871, resetsAt: 1794900000, status: "allowed_warning" },
				},
			}),
		).toEqual([
			{
				window: "five_hour",
				usedPercent: 42,
				resetsAt: new Date(1794500000 * 1000).toISOString(),
				status: "allowed",
			},
			{
				window: "seven_day",
				usedPercent: 87,
				resetsAt: new Date(1794900000 * 1000).toISOString(),
				status: "allowed_warning",
			},
		]);
	});

	it("falls back to the one window it names, and to nothing without a figure", () => {
		expect(
			limitsFromRateEvent({ rateLimitType: "seven_day", utilization: 0.5, status: "allowed" }),
		).toEqual([{ window: "seven_day", usedPercent: 50, status: "allowed" }]);
		expect(limitsFromRateEvent({ status: "allowed" })).toEqual([]);
		expect(limitsFromRateEvent(undefined)).toEqual([]);
	});
});
