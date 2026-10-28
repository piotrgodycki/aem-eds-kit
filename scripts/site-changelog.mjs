#!/usr/bin/env node
// Build site/changelog.html from CHANGELOG.md, so the site's changelog can't
// drift from the repo's, and stamp package.json's version into index.html.
// Run by the Pages workflow before upload; run it by hand
// (`node scripts/site-changelog.mjs`) to preview. The nav and footer are copied
// from site/docs.html, so every page keeps the same navigation.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "https://github.com/piotrgodycki/aem-eds-kit";
const SITE = "https://piotrgodycki.github.io/aem-eds-kit";

const md = readFileSync(path.join(root, "CHANGELOG.md"), "utf-8");
const docs = readFileSync(path.join(root, "site", "docs.html"), "utf-8");
const nav = docs.match(/<nav class="nav">[\s\S]*?<\/nav>/)?.[0];
const footer = docs.match(/<footer[\s\S]*?<\/footer>/)?.[0];
if (!nav || !footer) throw new Error("site/docs.html has no nav/footer to reuse");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Reference-style link definitions at the bottom: `[0.4.3]: https://…`.
const refs = new Map();
for (const m of md.matchAll(/^\[([^\]]+)\]:\s*(\S+)\s*$/gm)) refs.set(m[1], m[2]);

/** Inline markdown: `code`, **bold**, [text](url), EDS-NNN issue links. */
function inline(text) {
	// Code spans first, as placeholders, so **bold** may wrap them.
	const codes = [];
	const t = text.replace(/`([^`]+)`/g, (_m, c) => {
		codes.push(`<code>${esc(c)}</code>`);
		return `\u0000${codes.length - 1}\u0000`;
	});
	return esc(t)
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
		.replace(/\b(EDS-0*(\d+))\b/g, (_m, key, n) => `<a href="${REPO}/issues/${Number(n)}">${key}</a>`)
		.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

const slug = (v) => (v.toLowerCase() === "unreleased" ? "unreleased" : `v${v.replace(/[^0-9a-z]+/gi, "-")}`);

// Walk the file: intro paragraphs, then `## [version] - date`, `### Section`, `- item` (+ indented continuation).
const out = [];
const toc = [];
let intro = [];
let list = null;
let para = [];
let seenVersion = false;
const flushList = () => {
	if (list) out.push(`      <ul>\n${list.map((li) => `        <li>${inline(li)}</li>`).join("\n")}\n      </ul>`);
	list = null;
};
const flushPara = () => {
	if (para.length) (seenVersion ? out : intro).push(`<p>${inline(para.join(" "))}</p>`);
	para = [];
};
let open = false;
for (const raw of md.split("\n")) {
	const line = raw.replace(/\s+$/, "");
	if (/^\[[^\]]+\]:\s*\S+$/.test(line)) continue; // link definitions
	if (/^# /.test(line)) continue;
	const ver = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\S+))?/);
	if (ver) {
		flushList();
		flushPara();
		if (open) out.push("    </section>");
		seenVersion = true;
		open = true;
		const [_, v, date] = ver;
		const id = slug(v);
		const label = v.toLowerCase() === "unreleased" ? "Unreleased" : `v${v}`;
		const release = refs.get(v);
		toc.push(`<a href="#${id}">${esc(label)}</a>`);
		out.push(
			`    <section class="cl-version" id="${id}">\n      <h2>${release ? `<a href="${release}">${esc(label)}</a>` : esc(label)}${
				date ? ` <span class="cl-date">${esc(date)}</span>` : v.toLowerCase() === "unreleased" ? ' <span class="cl-date">on main, not yet on npm</span>' : ""
			}</h2>`,
		);
		continue;
	}
	const sec = line.match(/^### (.+)/);
	if (sec) {
		flushList();
		flushPara();
		out.push(`      <h3>${esc(sec[1])}</h3>`);
		continue;
	}
	const item = line.match(/^- (.*)/);
	if (item) {
		flushPara();
		list ??= [];
		list.push(item[1]);
		continue;
	}
	if (/^\s{2,}\S/.test(line) && list) {
		list[list.length - 1] += ` ${line.trim()}`;
		continue;
	}
	if (!line.trim()) {
		flushList();
		flushPara();
		continue;
	}
	flushList();
	para.push(line.trim());
}
flushList();
flushPara();
if (open) out.push("    </section>");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Changelog - aem-eds-kit</title>
  <meta name="description" content="Every change to aem-eds-kit, the CLI for AEM Edge Delivery Services: new features, fixes and the issues they closed.">
  <meta name="author" content="Piotr Godycki">
  <link rel="canonical" href="${SITE}/changelog.html">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="aem-eds-kit">
  <meta property="og:url" content="${SITE}/changelog.html">
  <meta property="og:title" content="aem-eds-kit changelog">
  <meta property="og:description" content="Every change to aem-eds-kit: new features, fixes and the issues they closed.">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta name="theme-color" content="#0D0D0C">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Generated from CHANGELOG.md by scripts/site-changelog.mjs - edit CHANGELOG.md, not this file. -->
  ${nav}

  <article class="guide changelog">
    <p class="crumbs"><a href="index.html">aem-eds-kit</a> / Changelog</p>
    <span class="eyebrow">Changelog</span>
    <h1>What changed, <span class="grad">release by release</span></h1>
    ${intro.map((p) => p.replace("<p>", '<p class="lead">')).join("\n    ")}
    <p>Each fix links to its issue; the issue links to the pull request that closed it. Source: <a href="${REPO}/blob/main/CHANGELOG.md" style="color:var(--accent)">CHANGELOG.md</a>.</p>
    <nav class="cl-toc" aria-label="Versions">${toc.join("")}</nav>

${out.join("\n")}
  </article>

  ${footer}
</body>
</html>
`;
writeFileSync(path.join(root, "site", "changelog.html"), html);
console.log(`site/changelog.html: ${toc.length} versions`);

// Keep the home page's structured-data version in step with package.json.
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
const indexFile = path.join(root, "site", "index.html");
const index = readFileSync(indexFile, "utf-8");
writeFileSync(indexFile, index.replace(/"softwareVersion": "[^"]*"/, `"softwareVersion": "${version}"`));
