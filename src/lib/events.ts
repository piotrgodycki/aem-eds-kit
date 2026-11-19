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
	| { type: "inventory"; inventory: unknown }
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
	| { type: "reopened"; name: string; version: number }
	/** The latest change taken back (eds draft undo): `version` is the draft now. */
	| { type: "undone"; name: string; version: number }
	| {
			/** The default branch's newer commits merged into draft/<name> (eds draft update). */
			type: "updated";
			name: string;
			branch: string;
			commit: string;
			/** How many commits came in; 0 when it was up to date. */
			merged: number;
			preview?: string;
			pushed: boolean;
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
			/** A draft version's sample content as a table to paste into a document (eds draft content). */
			type: "content";
			name: string;
			version: number;
			/** False when the version has no sample content: the table is the name over an empty row. */
			sample: boolean;
			/** The agent wrote the sample content just now (it had none); it stays with the draft. */
			wrote: boolean;
			/** The styles the block's CSS has (e.g. "dark" for `.hero.dark`), to pick with --variant. */
			variants: string[];
			html: string;
			text: string;
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
			/** A page_meta function the agent wrote (eds track page-function). */
			type: "page-function";
			name: string;
			/** Path in the project, scripts/page-meta-custom.js. */
			file: string;
			code: string;
	  }
	| {
			/** The project's own events and the blocks that push each one (eds track events). */
			type: "events";
			defs: Record<
				string,
				{ fields: Array<{ name: string; from: string; key?: string; value?: string }> }
			>;
			uses: Record<string, string[]>;
	  }
	| {
			/** The site's pages against pageMeta's rules (eds track page-check). */
			type: "page-meta-check";
			base: string;
			checked: number;
			/** Only the pages with problems. */
			pages: Array<{ path: string; problems: string[] }>;
	  }
	| {
			/** How far a draft version is from its design (eds draft fidelity). */
			type: "fidelity";
			name: string;
			version: number;
			/** Percent of pixels that differ, one decimal. */
			percent: number;
			target: number;
			width: number;
			scale: number;
			design: { file: string; width: number; height: number };
			render: { width: number; height: number };
			/** Design, render and diff images, project-relative. */
			files: string[];
	  }
	| {
			/** The CDN settings written from Adobe's guides (eds cdn setup). */
			type: "cdn-setup";
			cdn: string;
			host: string;
			origin: string;
			files: string[];
	  }
	| {
			/** The live domain against the BYO CDN and go-live guides (eds cdn check). */
			type: "cdn-check";
			host: string;
			checks: Array<{
				id: string;
				status: "pass" | "fail" | "warn";
				what: string;
				detail: string;
				fix?: string;
			}>;
	  }
	| {
			/** A page's document from DA (eds content get). */
			type: "content";
			path: string;
			html: string;
	  }
	| {
			/** A change to a page the agent made, kept for a person to accept (eds content propose). */
			type: "content-proposal";
			path: string;
			/** The changed document, in the project. */
			file: string;
			/** What the agent says it changed. */
			note: string;
			sections: Array<{ section: number; before: string; after: string }>;
	  }
	| {
			/** An accepted change written to DA, and the page's preview when it ran (eds content put). */
			type: "content-saved";
			path: string;
			preview: string | null;
	  }
	| {
			/** An issue the agent wrote from a person's notes, for them to edit and accept (eds issue write). */
			type: "issue-draft";
			kind: "feature" | "bug" | "task";
			title: string;
			/** Markdown. */
			body: string;
	  }
	| {
			/** What a branch changes, for its pull request's "What to test" (eds pr scope). */
			type: "pr-scope";
			base: string;
			head: string;
			blocks: Array<{ name: string; pages: number | null; examples: string[] }>;
			shared: string[];
			authoring: string[];
			other: string[];
			/** The branch's aem.page preview, or null. */
			preview: string | null;
			/** The "What to test" section, ready for a pull request's description. */
			markdown: string;
	  }
	| {
			/** Pages, views and clicks per block (eds block usage). */
			type: "block-usage";
			/** Where the pages were read from, or null when they couldn't be. */
			site: string | null;
			pagesRead: number;
			/** Days of RUM data, or null when RUM wasn't read. */
			days: number | null;
			blocks: Array<{
				name: string;
				pages: number | null;
				views: number | null;
				clickRate: number | null;
				lastChange: string | null;
			}>;
	  }
	| {
			/** Core Web Vitals from the site's RUM data (eds rum). */
			type: "rum";
			domain: string;
			days: number;
			device: string;
			pageViews: number;
			lcp: { p75: number | null; good: number; ni: number; poor: number };
			inp: { p75: number | null; good: number; ni: number; poor: number };
			cls: { p75: number | null; good: number; ni: number; poor: number };
			pages: Array<{
				path: string;
				views: number;
				lcp: number | null;
				inp: number | null;
				cls: number | null;
			}>;
	  }
	| {
			/** One element shown as Select shows it (eds draft shot --element). */
			type: "element-shot";
			name: string;
			version: number;
			element: string;
			/** Absolute path of the PNG, under tmp/eds-cli/qa/. */
			file: string;
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
