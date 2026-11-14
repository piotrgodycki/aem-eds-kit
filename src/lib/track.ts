/**
 * Instrument an EDS block's `decorate()` with analytics: clicks, form submits
 * and the block coming into view, each pushed as a data layer event under the
 * name you choose, optionally to the data layers you name and as a DOM
 * CustomEvent other scripts can listen to. Deterministic source rewrite: the
 * code sits between two markers, so running it again replaces the old choice.
 */

export interface TrackEvents {
	/** Event name for clicks on the block's links and buttons; null for none. */
	click: string | null;
	/** Event name for form submits in the block; null for none. */
	submit: string | null;
	/** Event name for the block first coming into view; null for none. */
	view?: string | null;
	/** Data layers to push to; none means `trackEvent` from scripts/analytics.js (GTM). */
	layers?: string[];
	/** Also dispatch each event on the block as a bubbling CustomEvent. */
	dispatch?: boolean;
}

export const DEFAULT_EVENTS = { click: "block_click", submit: "form_submit", view: "block_view" };

const START = "// --- analytics (eds track) ---";
const END = "// --- end analytics (eds track) ---";
const IMPORT_LINE = "import { trackEvent } from '../../scripts/analytics.js';";
const EVENT_NAME = /^[A-Za-z][\w:.-]{0,63}$/;

/** An event name, or the reason it can't be one. */
function badEventName(name: string): string | null {
	return EVENT_NAME.test(name)
		? null
		: `"${name}" isn't an event name (letters, digits, _ : . -; up to 64).`;
}

/** The instrumentation lines injected at the top of decorate(). */
function trackSnippet(blockName: string, param: string, ev: TrackEvents): string {
	const inline = !!ev.layers?.length;
	const lines: string[] = [`  ${START}`];
	// One place every event goes through: the chosen data layers (or trackEvent), and the DOM.
	lines.push(`  const track = (data) => {`);
	if (inline)
		lines.push(
			`    ${JSON.stringify(ev.layers).replace(/"/g, "'")}.forEach((name) => {`,
			"      window[name] = window[name] || [];",
			"      window[name].push(data);",
			"    });",
		);
	else lines.push("    trackEvent(data);");
	if (ev.dispatch)
		lines.push(
			`    ${param}.dispatchEvent(new CustomEvent(data.event, { bubbles: true, detail: data }));`,
		);
	lines.push("  };");
	if (ev.click)
		lines.push(
			`  ${param}.addEventListener('click', (e) => {`,
			"    const el = e.target.closest('a, button');",
			"    if (!el) return;",
			`    track({ event: '${ev.click}', block: '${blockName}', label: el.dataset.track || el.textContent.trim() });`,
			"  });",
		);
	if (ev.submit)
		lines.push(
			`  ${param}.addEventListener('submit', () => {`,
			`    track({ event: '${ev.submit}', block: '${blockName}' });`,
			"  });",
		);
	if (ev.view)
		lines.push(
			"  new IntersectionObserver((entries, observer) => {",
			"    if (!entries.some((entry) => entry.isIntersecting)) return;",
			"    observer.disconnect();",
			`    track({ event: '${ev.view}', block: '${blockName}' });`,
			`  }, { threshold: 0.5 }).observe(${param});`,
		);
	lines.push(`  ${END}`);
	return lines.join("\n");
}

interface InstrumentResult {
	js: string;
	changed: boolean;
	reason?: string;
}

const DECORATE =
	/export default (?:async )?function decorate\s*\(\s*([A-Za-z_$][\w$]*)?[^)]*\)\s*\{/;

/**
 * Put the tracking in the block's `decorate()`, replacing what an earlier run
 * put there. Returns `changed: false` with a reason when nothing is selected,
 * a name is bad, or no `decorate()` is found.
 */
export function instrumentJs(js: string, blockName: string, ev: TrackEvents): InstrumentResult {
	if (!ev.click && !ev.submit && !ev.view)
		return { js, changed: false, reason: "no events selected" };
	for (const name of [ev.click, ev.submit, ev.view].filter((n): n is string => !!n)) {
		const bad = badEventName(name);
		if (bad) return { js, changed: false, reason: bad };
	}
	// Tracking from an earlier run goes, so this run's choice replaces it.
	let out = js.replace(new RegExp(`\\n?[ \\t]*${escape(START)}[\\s\\S]*?${escape(END)}`), "");
	if (out.includes("analytics (eds track)"))
		return { js, changed: false, reason: "tracking from an older eds is there; remove it first" };

	const decorate = out.match(DECORATE);
	if (!decorate || decorate.index === undefined)
		return { js, changed: false, reason: "no `export default function decorate(...)` found" };
	const param = decorate[1] || "block";

	const usesImport = !ev.layers?.length;
	if (usesImport && !out.includes("scripts/analytics.js")) {
		const imports = [...out.matchAll(/^import .*$/gm)];
		if (imports.length) {
			const last = imports[imports.length - 1];
			const at = (last.index ?? 0) + last[0].length;
			out = `${out.slice(0, at)}\n${IMPORT_LINE}${out.slice(at)}`;
		} else out = `${IMPORT_LINE}\n\n${out}`;
	}
	if (!usesImport && !/trackEvent\(/.test(out.replace(IMPORT_LINE, "")))
		out = out.replace(`${IMPORT_LINE}\n`, "").replace(IMPORT_LINE, "");

	const d2 = out.match(DECORATE);
	if (!d2 || d2.index === undefined) return { js, changed: false, reason: "decorate not found" };
	const at = d2.index + d2[0].length;
	out = `${out.slice(0, at)}\n${trackSnippet(blockName, param, ev)}${out.slice(at)}`;
	return { js: out, changed: out !== js };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
