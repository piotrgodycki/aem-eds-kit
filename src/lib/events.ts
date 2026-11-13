/**
 * Machine-readable event stream for `--json` on `block from-design`, the
 * `draft` commands, `ask` and `agents`: one JSON object per line on stdout, while the usual human
 * output stays on stderr. Tools (aem-eds-studio) spawn the CLI and read these.
 *
 * Every event carries `v` (the schema version, bumped only on a breaking
 * change) and `type`. The stream always ends with one `result` event.
 */

import { stripVTControlCharacters } from "node:util";
import type { AskAction } from "./agents/ask.js";

const EVENTS_VERSION = 1;

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** One usage window of the agent's plan, e.g. Claude's 5-hour or weekly limit. */
export interface PlanLimit {
	/** As the agent names it: five_hour, seven_day, seven_day_opus, … */
	window: string;
	usedPercent: number;
	/** ISO time the window resets. */
	resetsAt?: string;
	/** allowed, allowed_warning (past a warning threshold) or rejected (limit reached). */
	status?: string;
}

type EdsEvent =
	| { type: "start"; command: string; cli: string }
	| { type: "log"; level: "debug" | "info" | "success" | "warn" | "error"; message: string }
	| { type: "agent"; tool: string; label: string; durationMs?: number; failed?: boolean }
	| {
			type: "agent-result";
			durationMs?: number;
			/** What the run would cost on the API (Claude Code reports it on any plan). */
			costUsd?: number;
			agent?: string;
			models?: string[];
			tokens?: TokenUsage;
			/** The plan's usage windows, as the agent last reported them. */
			limits?: PlanLimit[];
	  }
	| { type: "prompt"; file: string; block: string }
	| {
			type: "draft";
			name: string;
			version: number;
			ok: boolean;
			dir: string;
			files: string[];
			feedback?: string;
	  }
	| { type: "drafts"; drafts: unknown[] }
	| { type: "agents"; agents: unknown[] }
	| { type: "preview"; name: string; url: string; version?: number }
	| {
			type: "accepted";
			name: string;
			version: number;
			commit?: string;
			branch?: string;
			/** Accepted on its branch: its aem.page preview, and a pull request's title and body. */
			preview?: string;
			title?: string;
			body?: string;
	  }
	| {
			/** A pull request's title and description for a draft version (eds draft describe). */
			type: "description";
			name: string;
			version: number;
			title: string;
			body: string;
	  }
	| {
			/** Screenshots of a draft version, one per breakpoint (eds draft shot). */
			type: "shots";
			name: string;
			version: number;
			/** Paths in the block's folder, e.g. __snapshots__/hero-1440.png. */
			files: string[];
			widths: number[];
	  }
	| {
			/** A draft version committed on draft/<name> (and pushed when origin is on GitHub). */
			type: "pushed";
			name: string;
			version: number;
			branch: string;
			commit: string;
			preview?: string;
			pushed: boolean;
	  }
	| { type: "discarded"; name: string }
	| {
			type: "answer";
			/** The agent's reply to `eds ask`, without its action block. */
			text: string;
			/** An action the agent proposes; the caller confirms it with the user before running it. */
			action?: AskAction;
			/** The latest message accepts the pending action (`--input`'s `pending`): the caller runs that one. */
			accepts?: true;
	  }
	| { type: "result"; ok: boolean; exitCode: number };

let enabled = false;

export const events = {
	enable(): void {
		enabled = true;
	},
	get enabled(): boolean {
		return enabled;
	},
	emit(event: EdsEvent): void {
		if (!enabled) return;
		process.stdout.write(`${JSON.stringify({ v: EVENTS_VERSION, ...event })}\n`);
	},
};

/** Turn logger arguments into one plain-text line for a `log` event. */
export function plain(args: unknown[]): string {
	return stripVTControlCharacters(
		args
			.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : String(a)))
			.join(" "),
	);
}
