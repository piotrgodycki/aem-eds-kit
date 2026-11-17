/**
 * `eds track event <name>` and `eds track events`: the project's own data layer
 * events in .edsrc.json, and the blocks that push them. Saving an event writes
 * every block that uses it again, so a change reaches all of them at once.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type EventDefs, parseEvent, parseEvents } from "../lib/custom-events.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { findProjectRoot } from "../lib/project.js";
import { choiceEvents, instrumentJs, savedChoice } from "../lib/track.js";
import * as ui from "../lib/ui.js";

/** .edsrc.json as written; {} when there is none. */
async function readConfig(root: string): Promise<Record<string, unknown>> {
	try {
		return JSON.parse(await readFile(path.join(root, ".edsrc.json"), "utf-8")) as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

/** The project's events from .edsrc.json, checked. */
export async function projectEvents(root: string): Promise<EventDefs> {
	return parseEvents((await readConfig(root)).events);
}

/** Each block's tracked JS file and the events it pushes, from the choice kept in its code. */
async function blockUses(
	root: string,
): Promise<Array<{ block: string; file: string; events: string[] }>> {
	const out: Array<{ block: string; file: string; events: string[] }> = [];
	const dir = path.join(root, "blocks");
	for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		if (!e.isDirectory()) continue;
		const file = path.join("blocks", e.name, `${e.name}.js`);
		const js = await readFile(path.join(root, file), "utf-8").catch(() => "");
		const choice = savedChoice(js);
		if (choice) out.push({ block: e.name, file, events: choiceEvents(choice) });
	}
	return out;
}

/** Which blocks push each event, by name. */
function usesByEvent(uses: Array<{ block: string; events: string[] }>): Record<string, string[]> {
	const by: Record<string, string[]> = {};
	for (const u of uses) for (const ev of u.events) by[ev] = [...(by[ev] ?? []), u.block];
	return by;
}

interface TrackEventOptions {
	/** The event's fields, as JSON: [{ name, from, key?, value? }]. */
	fields?: string;
	/** Take the event out of .edsrc.json (blocks that use it go back to the default payload). */
	remove?: boolean;
	/** Commit the changed files on this branch and push it; the working tree stays as it was. */
	branch?: string;
}

/** `eds track event <name> --fields <json> | --remove` */
export async function trackEvent(name: string, options: TrackEventOptions): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	const config = await readConfig(root);
	let defs: EventDefs;
	try {
		defs = parseEvents(config.events);
		if (options.remove) delete defs[name];
		else if (options.fields === undefined)
			throw new Error("Give the event's --fields, or --remove it.");
		else defs[name] = parseEvent(name, { fields: JSON.parse(options.fields) });
		if (options.branch) {
			const { badBranchName } = await import("../lib/draft-branch.js");
			const bad = badBranchName(options.branch);
			if (bad) throw new Error(bad);
		}
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}

	const using = (await blockUses(root)).filter((u) => u.events.includes(name));
	const files = [".edsrc.json", ...using.map((u) => u.file)];
	const before = new Map<string, string | null>();
	for (const rel of files) {
		const file = path.join(root, rel);
		before.set(rel, existsSync(file) ? await readFile(file, "utf-8") : null);
	}

	const { events: _old, ...rest } = config;
	const next = Object.keys(defs).length ? { ...rest, events: defs } : rest;
	await writeFile(path.join(root, ".edsrc.json"), `${JSON.stringify(next, null, 2)}\n`);
	const done: Array<[string, string]> = [
		[".edsrc.json", options.remove ? `${name} removed` : `${name} saved`],
	];
	for (const u of using) {
		const js = before.get(u.file) ?? "";
		const choice = savedChoice(js);
		if (!choice) continue;
		const res = instrumentJs(js, u.block, { ...choice, defs });
		if (!res.changed) continue;
		await writeFile(path.join(root, u.file), res.js);
		done.push([u.file, `pushes ${name} as saved`]);
	}

	if (options.branch) {
		const { commitFilesOnBranch } = await import("../lib/draft-branch.js");
		const changed: string[] = [];
		for (const [rel, was] of before) {
			const now = await readFile(path.join(root, rel), "utf-8").catch(() => null);
			if (now !== was) changed.push(rel);
		}
		try {
			const r = await commitFilesOnBranch(
				root,
				options.branch,
				changed,
				`Tracking: the ${name} event (eds track event)`,
			);
			events.emit({ type: "pushed", name, version: 0, ...r });
			done.push([
				r.branch,
				r.pushed ? "committed and pushed" : "committed (no GitHub remote to push to)",
			]);
		} finally {
			for (const [rel, content] of before) {
				const file = path.join(root, rel);
				if (content === null) await rm(file, { force: true });
				else await writeFile(file, content);
			}
		}
	}

	events.emit({ type: "events", defs, uses: usesByEvent(await blockUses(root)) });
	logger.info(ui.heading(`Event ${name}`));
	const w = ui.columnWidth(done.map(([f]) => f));
	for (const [f, what] of done) logger.info(ui.accentLine(f, what, w));
}

/** `eds track events`: the project's events and the blocks that push each one. */
export async function trackEvents(): Promise<void> {
	const root = findProjectRoot();
	if (!root) {
		logger.error("Not inside an EDS project (no EDS project markers found).");
		process.exitCode = 1;
		return;
	}
	let defs: EventDefs;
	try {
		defs = await projectEvents(root);
	} catch (err) {
		logger.error((err as Error).message);
		process.exitCode = 1;
		return;
	}
	const uses = usesByEvent(await blockUses(root));
	events.emit({ type: "events", defs, uses });
	logger.info(ui.heading("Events"));
	const names = [...new Set([...Object.keys(defs), ...Object.keys(uses)])].sort();
	if (!names.length) logger.info("  None yet: eds track event <name> --fields '<json>' adds one.");
	const w = ui.columnWidth(names);
	for (const n of names)
		logger.info(
			ui.accentLine(
				n,
				`${defs[n] ? `${defs[n].fields.length} fields` : "default"}${uses[n] ? `, in ${uses[n].join(", ")}` : ""}`,
				w,
			),
		);
}
