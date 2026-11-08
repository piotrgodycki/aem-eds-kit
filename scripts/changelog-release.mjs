#!/usr/bin/env node
// Moves the CHANGELOG's Unreleased section under a released version, with its
// date and npm link. The Publish workflow runs it after `npm publish`:
//   node scripts/changelog-release.mjs <version> [YYYY-MM-DD] [file]
// It prints the release notes (the version's section) on stdout.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NPM = "https://www.npmjs.com/package/aem-eds-kit/v";

/** The CHANGELOG with Unreleased released as `version` (unchanged when Unreleased is empty). */
export function release(text, version, date) {
	const head = "## [Unreleased]\n";
	const start = text.indexOf(head);
	if (start < 0) throw new Error("No ## [Unreleased] section.");
	if (text.includes(`## [${version}]`)) return text;
	const next = text.indexOf("\n## [", start + head.length);
	const body = text.slice(start + head.length, next < 0 ? undefined : next).trim();
	if (!body) return text;
	let out = text.replace(head, `${head}\n## [${version}] - ${date}\n`);
	out = out.replace(/^(\[Unreleased\]: .*)$/m, `$1\n[${version}]: ${NPM}/${version}`);
	return out;
}

/** The release notes: the version's section without its heading ("" when there is none). */
export function notes(text, version) {
	const head = `## [${version}]`;
	const start = text.indexOf(head);
	if (start < 0) return "";
	const rest = text.slice(text.indexOf("\n", start) + 1);
	const end = rest.search(/\n## \[|\n\[[^\]]+\]: /);
	return (end < 0 ? rest : rest.slice(0, end)).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [version, date = new Date().toISOString().slice(0, 10), file = "CHANGELOG.md"] =
		process.argv.slice(2);
	if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
		console.error("usage: changelog-release.mjs <x.y.z> [YYYY-MM-DD] [file]");
		process.exit(2);
	}
	const out = release(readFileSync(file, "utf-8"), version, date);
	writeFileSync(file, out);
	process.stdout.write(notes(out, version));
}
