#!/usr/bin/env node
// Docs gate (EDS-083): a change to the CLI ships with its docs in the same PR.
// - anything under src/            → CHANGELOG.md (the site's changelog page is built from it)
// - the CLI surface (src/bin/eds.ts, commands and flags) → README.md (also the npm page)
//   and site/docs.html
// Usage: node scripts/check-docs.mjs <base-ref>   (CI passes origin/<base branch>)
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";
const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf-8" })
	.split("\n")
	.filter(Boolean);
const has = (f) => changed.includes(f);

const missing = [];
if (changed.some((f) => f.startsWith("src/")) && !has("CHANGELOG.md")) {
	missing.push("CHANGELOG.md - add an entry under [Unreleased] for the change in src/");
}
if (has("src/bin/eds.ts")) {
	if (!has("README.md")) missing.push("README.md - the CLI surface changed (src/bin/eds.ts); README is also the npm page");
	if (!has("site/docs.html")) missing.push("site/docs.html - the CLI surface changed (src/bin/eds.ts)");
}

if (missing.length) {
	console.error("Docs gate: this change needs its docs updated in the same PR:\n");
	for (const m of missing) console.error(`  - ${m}`);
	console.error("\nSee CODING_STANDARDS.md (\"Every change updates the docs\").");
	process.exit(1);
}
console.log(`Docs gate: ok (${changed.length} files changed vs ${base}).`);
