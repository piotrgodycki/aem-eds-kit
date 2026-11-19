import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A page template as aem-eds-studio's template builder edits it: sections in
 * order, each with its blocks, their variants and their starting content. The
 * same spec feeds the preview, and later the content package and local AEM.
 */
export interface TemplateSpec {
	name: string;
	title: string;
	sections: Array<{
		/** Section styles (section-metadata Style), e.g. ["highlight"]. */
		style?: string[];
		blocks: Array<{
			name: string;
			/** Block variants, the classes after the name, e.g. ["dark"]. */
			variant?: string[];
			/** Starting content by field name; empty uses the block's own sample. */
			fields?: Record<string, string>;
		}>;
	}>;
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The spec from JSON, checked, or an error that says what is wrong. */
export function parseSpec(json: string): TemplateSpec {
	const raw = JSON.parse(json) as Partial<TemplateSpec>;
	if (typeof raw.name !== "string" || !NAME.test(raw.name))
		throw new Error(
			"The template's name is lower case letters, digits and dashes, e.g. product-detail.",
		);
	if (!Array.isArray(raw.sections)) throw new Error("The template has no sections.");
	for (const s of raw.sections)
		for (const b of s.blocks ?? [])
			if (!NAME.test(b.name) || (b.variant ?? []).some((v) => !NAME.test(v)))
				throw new Error(`"${b.name}" isn't a block name with plain variants.`);
	return {
		name: raw.name,
		title: typeof raw.title === "string" ? raw.title : raw.name,
		sections: raw.sections.map((s) => ({ style: s.style ?? [], blocks: s.blocks ?? [] })),
	};
}

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The fields of a block's UE model in order (tabs skipped), or none. */
async function modelFields(root: string, block: string): Promise<string[]> {
	const file = path.join(root, "blocks", block, `_${block}.json`);
	if (!existsSync(file)) return [];
	try {
		const parsed = JSON.parse(await readFile(file, "utf-8"));
		const model = (parsed.models ?? []).find((m: { id: string }) => m.id === block);
		return (model?.fields ?? [])
			.filter((f: { component: string }) => f.component !== "tab" && f.component !== "container")
			.map((f: { name: string }) => f.name);
	} catch {
		return [];
	}
}

/** The block's authored sample, reduced to its block div, or null. */
async function sample(root: string, block: string): Promise<string | null> {
	const file = path.join(root, "blocks", block, `_${block}.preview.html`);
	if (!existsSync(file)) return null;
	const raw = await readFile(file, "utf-8");
	const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw)?.[1] ?? raw;
	// Scripts, styles and comments go, repeated until none is left, since removing
	// one can join the pieces of another (<scr<script></script>ipt>).
	const unwanted = /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi;
	let html = body;
	for (let before = ""; before !== html; ) {
		before = html;
		html = html.replace(unwanted, "");
	}
	return html.trim();
}

/**
 * One block as EDS delivers it: a div named after the block and its variants,
 * one row per field. Without starting content it uses the block's sample, so
 * the block's JS gets markup it already decorates.
 */
async function blockHtml(
	root: string,
	b: TemplateSpec["sections"][number]["blocks"][number],
): Promise<string> {
	const classes = [b.name, ...(b.variant ?? [])].join(" ");
	const fields = b.fields && Object.keys(b.fields).length ? b.fields : null;
	if (!fields) {
		const s = await sample(root, b.name);
		if (s) return s.replace(/class="[^"]*"/, `class="${classes}"`);
	}
	// The model's fields in order; a block without a model takes the fields as given.
	const model = await modelFields(root, b.name);
	const names = model.length ? model : fields ? Object.keys(fields) : ["content"];
	const rows = names.map((n) => `<div><div>${esc(fields?.[n] ?? `${b.name} ${n}`)}</div></div>`);
	return `<div class="${classes}">${rows.join("")}</div>`;
}

/**
 * The page's `<main>`: a div per section with its blocks. EDS applies a section's
 * style before it delivers the page, as classes on the section div, so the
 * preview does the same rather than sending a section-metadata block.
 */
export async function templateMain(root: string, spec: TemplateSpec): Promise<string> {
	const sections: string[] = [];
	for (const s of spec.sections) {
		const blocks = await Promise.all(s.blocks.map((b) => blockHtml(root, b)));
		const style = s.style?.length ? ` class="${esc(s.style.join(" "))}"` : "";
		sections.push(`<div${style}>${blocks.join("\n")}</div>`);
	}
	return `<main>\n${sections.join("\n")}\n</main>`;
}

/**
 * The whole page as EDS serves it: the project's head.html, an empty header and
 * footer that the project's scripts fill from /nav and /footer, and the template.
 */
export async function templatePage(root: string, spec: TemplateSpec): Promise<string> {
	const headFile = path.join(root, "head.html");
	const head = existsSync(headFile) ? await readFile(headFile, "utf-8") : "";
	return `<!DOCTYPE html>
<html lang="en">
<head>
<title>${esc(spec.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
${head}
</head>
<body>
<header></header>
${await templateMain(root, spec)}
<footer></footer>
</body>
</html>
`;
}
