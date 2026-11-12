/**
 * Machine-readable event stream for `--json` on `block from-design`, the
 * `draft` commands and `agents`: one JSON object per line on stdout, while the usual human
 * output stays on stderr. Tools (aem-eds-studio) spawn the CLI and read these.
 *
 * Every event carries `v` (the schema version, bumped only on a breaking
 * change) and `type`. The stream always ends with one `result` event.
 */

import { stripVTControlCharacters } from "node:util";

const EVENTS_VERSION = 1;

type EdsEvent =
	| { type: "start"; command: string; cli: string }
	| { type: "log"; level: "debug" | "info" | "success" | "warn" | "error"; message: string }
	| { type: "agent"; tool: string; label: string; durationMs?: number; failed?: boolean }
	| { type: "agent-result"; durationMs?: number; costUsd?: number }
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
	| { type: "accepted"; name: string; version: number; commit?: string; branch?: string }
	| { type: "discarded"; name: string }
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
