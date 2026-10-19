import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PARTIALS } from "../model/partials.js";
import type { FigmaUrlParts } from "../schemas.js";

const PROMPT_VERSION = "0.7.1";

export { PROMPT_VERSION };

export type ContentSource = "document" | "ue" | "cf" | "mixed";

/**
 * Design source. Figma reads via REST/MCP (canvas — not scrapeable); Framer and
 * Google Stitch render real HTML, so they're scraped with headless Chromium.
 */
export type DesignProvider = "figma" | "framer" | "stitch";

export const PROVIDER_NAMES: Record<DesignProvider, string> = {
	figma: "Figma",
	framer: "Framer",
	stitch: "Google Stitch",
};

export interface PromptContext {
	/** Design source. Defaults to "figma". */
	provider?: DesignProvider;
	/** Figma URL parts (for the Figma provider). */
	figma?: FigmaUrlParts | null;
	/** Generic design reference / link (for non-Figma providers). */
	designRef?: string;
	blockName: string;
	projectRoot: string;
	withUeModel: boolean;
	/** Where the block's content comes from. Defaults to document authoring. */
	contentSource?: ContentSource;
	/** Optional CF model / GraphQL persisted-query hint (for cf/mixed). */
	cfHint?: string;
	/** Add a screenshot MCP call for pixel verification. Opt-in — each MCP call is scarce on Figma's plan. */
	screenshot?: boolean;
	existingTokens?: string;
	/**
	 * How the agent gets the design in Step 1 (the fetch→cache→generate seam):
	 * - `spec`: a normalized design JSON already fetched (Figma REST, or a reused
	 *   cache) is embedded — the agent calls NO design MCP.
	 * - `file`: a local SVG/PNG export the agent reads from disk — no MCP.
	 * - `mcp`: the agent makes ONE `get_design_context` call then writes it to
	 *   `cachePath` so retries/refines reuse it without another MCP call.
	 * - `scrape`: a design scraped from a live HTML page (Framer / Stitch) via
	 *   headless Chromium is embedded — the agent calls NO MCP.
	 * When omitted, falls back to reading the design reference directly.
	 */
	design?: DesignInput;
}

/** Where the agent's design data comes from in Step 1. See {@link PromptContext.design}. */
export type DesignInput =
	| { mode: "spec"; spec: string; cachePath?: string }
	| { mode: "file"; filePath: string }
	| { mode: "mcp"; cachePath: string }
	| { mode: "scrape"; spec: string; cachePath?: string };

/** Guidance for Content-Fragment-backed and mixed (UE + CF) blocks. */
/** Minify a JSON spec for the prompt (the cached copy stays pretty); non-JSON passes through. */
function compactJson(spec: string): string {
	try {
		return JSON.stringify(JSON.parse(spec));
	} catch {
		return spec;
	}
}

function contentSourceGuidance(
	source: ContentSource | undefined,
	cfHint: string | undefined,
	blockName: string,
): string {
	if (!source || source === "document" || source === "ue") return "";
	const q = cfHint ? ` (model / persisted query: \`${cfHint}\`)` : "";
	const gql = "`${window.location.origin}/graphql/execute.json/<project>/<query>;path=<cfPath>`";
	if (source === "cf") {
		return `
## Content source: Content Fragment
This block renders an AEM **Content Fragment**${q} - not inline-authored copy.
- UE model: use an \`aem-content-fragment\` field (e.g. \`name: "fragment"\`) for the CF reference.
- \`decorate(block)\` must be **async**: read the CF reference from the authored DOM (a link to \`/content/dam/...\`), fetch its fields through an AEM GraphQL **persisted query** (${gql}), then build the DOM from the returned fields.
- Handle loading / empty / error states. Do not hardcode copy that the CF owns.
- \`.${blockName}\` styling still follows the EDS conventions below.
`;
	}
	// mixed
	return `
## Content source: Mixed (Universal Editor + Content Fragment)
This block mixes **two sources in one model and one \`decorate(block)\`**:
- **Inline (UE-authored)** parts → normal fields (text / richtext / image / select) read straight from the authored DOM cells, with semantic collapsing.
- **Content Fragment** part${q} → an \`aem-content-fragment\` field; \`decorate()\` is **async** and also fetches that CF via a GraphQL persisted query (${gql}) and renders its fields.
- Field order in the model = cell order in the authored DOM. Read the inline cells by position; detect the CF reference by its \`/content/dam/\` link. Merge both into the final markup, and handle the CF loading/empty/error states.
`;
}

export async function buildPrompt(ctx: PromptContext): Promise<string> {
	const tokensHint = await getTokensHint(ctx.projectRoot);
	const contentSourceSection = contentSourceGuidance(ctx.contentSource, ctx.cfHint, ctx.blockName);
	const withScreenshot = ctx.screenshot === true; // opt-in — MCP calls are scarce
	const provider = ctx.provider ?? "figma";
	const providerName = PROVIDER_NAMES[provider];
	const design = ctx.design;
	const fileIsRaster =
		design?.mode === "file" ? /\.(png|jpe?g|webp)$/i.test(design.filePath) : false;

	// ── Step 5 verification (single pass) — phrased for how the design arrived ──
	const verifyAgainst =
		design?.mode === "spec"
			? "the exact values in the embedded design data from Step 1"
			: design?.mode === "scrape"
				? "the exact values in the scraped design data from Step 1"
				: design?.mode === "file"
					? fileIsRaster
						? "the local design image"
						: "the exact values in the local SVG"
					: design?.mode === "mcp"
						? "the exact values from the `get_design_context` you cached"
						: withScreenshot
							? "the `get_screenshot` image"
							: "the exact values from `get_design_context`";
	const verifyStep = `## Step 5 — One Verification Pass (single pass, then stop)
Do **exactly one** self-check — do **not** loop:
1. Compare your implementation to ${verifyAgainst} once, across: spacing, fonts, colors, radius, shadows, alignment and proportions.
2. Apply **one** round of corrections, then **stop** — don't iterate to "pixel perfect". The author reviews the result in the live preview (\`eds block preview\`) and will request another pass with specific feedback if needed.
3. Briefly state what you checked and any value you had to infer.`;

	// ── Step 1 fetch — the fetch→cache→generate seam, one branch per design source ──
	const target = `Target: fileKey \`${ctx.figma?.fileKey}\`${ctx.figma?.nodeId ? `, node \`${ctx.figma.nodeId}\`` : " (no node selected — use the full page)"}.`;
	let fetchSection: string;
	if (design?.mode === "spec") {
		fetchSection = `## Step 1 — Use the Provided Design Data (no MCP)
The design was already fetched for you and is embedded below — **do not call any Figma MCP tool** (\`get_design_context\`, \`get_variable_defs\`, \`get_screenshot\`). Parse it for the exact structure, layout, spacing, colors, typography, radius and effects.

\`\`\`json
${design.spec}
\`\`\`

Image fills are placeholders (the data references assets, not pixels) — render a placeholder at the right aspect-ratio per the Placeholders section; authors supply the real image.`;
	} else if (design?.mode === "scrape") {
		fetchSection = `## Step 1 — Use the Scraped Design Data (no MCP)
The design was scraped from the live **${providerName}** page (${ctx.designRef ?? "the URL"}) with headless Chromium and is embedded below — **do not call any MCP tool** and **do not fetch the URL yourself**. The tree holds **computed** values: geometry (\`rect\` x/y/w/h, px), layout (\`display\`/\`flexDirection\`/\`gap\`/\`padding\`), colours, typography, radius and shadows. Use them verbatim (convert px→rem where appropriate) and regroup the flattened DOM into semantic structure yourself (Step 3).

\`\`\`json
${compactJson(design.spec)}
\`\`\`

If the page holds several sections, build **only** the one for \`${ctx.blockName}\` (the element whose class or \`data-block\` matches the block name) and read the rest only for shared tokens.

The scraped **text and images are reference content**, not authored copy — reproduce the layout/styling exactly, but read real content from the authored DOM at runtime and fall back to placeholders (see the Placeholders section). Do **not** hardcode the scraped copy or ship the scraped image URLs.`;
	} else if (design?.mode === "file") {
		fetchSection = `## Step 1 — Read the Local Design Export (no MCP)
Read \`${design.filePath}\` with your **Read** tool. Do **not** call any Figma MCP tool.

${
	fileIsRaster
		? "It's a raster image (PNG/JPG) — open it and reproduce it visually: infer spacing, colors, typography, radius, shadows and layout as precisely as you can from the pixels."
		: "It's an **SVG** — read it as text and parse the **exact** values: geometry and positions (x/y/width/height, `viewBox`), text and typography (font-family / font-size / font-weight on `<text>`/`<tspan>`), fills and gradients, strokes, and effects. Use the numbers verbatim, converting px→rem where appropriate. The SVG is flattened — regroup into semantic structure yourself (Step 3), don't mirror raw `<g>`/`<path>` nesting."
}`;
	} else if (design?.mode === "mcp") {
		fetchSection = `## Step 1 — Fetch the Design Once, Then Cache It (single MCP call)
Call **\`get_design_context\` exactly once** for the target node. Do **not** call \`get_variable_defs\` or \`get_screenshot\` — each extra MCP call burns the Figma plan's scarce tool-call budget; derive colors and tokens from the context you already got.
**Immediately after**, \`Write\` the raw design data you received to \`${design.cachePath}\` (pretty JSON) so re-runs and refine passes reuse it without another MCP call. Then generate from it.

${target}`;
	} else if (provider === "figma") {
		fetchSection = `## Step 1 — Fetch the Design (single MCP call)
Call **\`get_design_context\` exactly once** for the target node — it returns structure, layout, measurements, text and the colors/tokens you need. Do **not** call \`get_variable_defs\`${withScreenshot ? "" : " or `get_screenshot`"} — each extra MCP call burns the Figma plan's scarce budget.${withScreenshot ? " You may call `get_screenshot` once (`maxDimension: 1024`) for the Step 5 check." : ""}

${target}`;
	} else {
		fetchSection = `## Step 1 — Read the Design
Open the live **${providerName}** page at \`${ctx.designRef ?? "(the design URL)"}\` and read its rendered layout, typography, colours, spacing, radius and effects. Extract the **exact** values — do not approximate.`;
	}

	const ueModelSection = ctx.withUeModel
		? `
## Step 4b — Universal Editor Authoring (REQUIRED, not optional)
Authors must be able to drop and edit this block in the Universal Editor, so generate its UE configuration **in the same pass** as the code.

Create \`blocks/${ctx.blockName}/_${ctx.blockName}.json\` using the EDS block-plugin (xwalk) format with three top-level arrays:

\`\`\`json
{
  "definitions": [
    {
      "title": "<Human Title>",
      "id": "${ctx.blockName}",
      "plugins": {
        "xwalk": {
          "page": {
            "resourceType": "core/franklin/components/block/v1/block",
            "template": { "name": "<Human Title>", "model": "${ctx.blockName}" }
          }
        }
      }
    }
  ],
  "models": [
    { "id": "${ctx.blockName}", "fields": [ /* one field per authorable piece of content */ ] }
  ],
  "filters": []
}
\`\`\`

Derive the **model fields from the Figma design**, not boilerplate. Pick the correct field \`component\` for each authorable element from the **full Universal Editor field catalog** (17 types) — do not default everything to text:

| component | valueType | Use for |
|---|---|---|
| \`text\` | string | Single-line: titles, labels, alt text, short strings |
| \`textarea\` | string | Multi-line plain text: descriptions, notes |
| \`richtext\` | string | Formatted copy: body with bold/italic/lists/links |
| \`reference\` | string | AEM asset (image/video/doc) from DAM. \`multi:true\` for many |
| \`aem-content\` | any | Page link / URL / content path (content picker) |
| \`aem-content-fragment\` | any | Content Fragment reference |
| \`aem-experience-fragment\` | any | Experience Fragment reference |
| \`aem-tag\` | string | Tag picker for categorization |
| \`select\` | string | Single choice dropdown — **requires \`options\`** |
| \`multiselect\` | string | Multiple choice (often \`name:"classes"\` → CSS variants) — **requires \`options\`** |
| \`checkbox-group\` | string[] | Multiple independent toggles — **requires \`options\`** |
| \`radio-group\` | string | Mutually exclusive choice — **requires \`options\`** |
| \`boolean\` | boolean | Single on/off toggle |
| \`number\` | number | Counts, limits (validation: \`numberMin\`/\`numberMax\`) |
| \`date-time\` | date | Date/time picker |
| \`container\` | any | Group nested \`fields\`; \`multi:true\` = repeatable items (cards/slides) |
| \`tab\` | any | Organize the property panel into tabs (UI only, not data) |

Rules:
- Every field needs \`component\`, \`name\`, \`label\`. Include the enforced \`valueType\` from the table. Add \`value\` (default), \`description\`, \`required\`, \`condition\` (JSON Logic) where useful.
- \`options\` format for select/multiselect/checkbox-group/radio-group: \`[{ "name": "Display", "value": "stored" }]\` (multiselect also supports grouped \`children\`).
- **Semantic collapsing** — name paired fields so EDS collapses them into one element:
  - \`image\` (reference) + \`imageAlt\` (text) → \`<picture><img alt="…">\`
  - \`link\` (aem-content) + \`linkText\` (text) + \`linkTitle\` (text) + \`linkType\` (text) → \`<a href title>text</a>\`
  - \`title\` (text) + \`titleType\` (select h1–h6) → \`<h2>title</h2>\` at the chosen level
  - \`classes\` (multiselect) → values become CSS classes on the block root
  - fields prefixed \`group_\` share one cell
- Map Figma **text layers**: headings → \`title\`+\`titleType\`; body → \`richtext\`; short labels → \`text\`.
- Map **image/media layers** → \`reference\` (+ \`imageAlt\`). **Links/CTAs** → \`link\`/\`linkText\`.
- Map **component variants** → a \`multiselect\` named \`classes\` (or a \`select\`) whose options are the variant values (e.g. Theme dark/light, Layout centered) → CSS modifier classes on the block root. Keep JS/CSS variant handling in sync.
- **Repeatable groups** (card lists, carousels, tabs): either a \`container\` field with \`multi:true\` and nested \`fields\`, or — for true child blocks — a container definition (\`template.filter\`) + an item definition (resourceType \`core/franklin/components/block/v1/block/item\`) + a matching \`filters\` entry.
- Field \`name\`s must match what \`decorate()\` reads from the authored DOM. No underscores in names when using xwalk (except the \`group_\` grouping prefix).

**Make multifields and dropdowns actually work — the config is only half; \`decorate()\` MUST consume every field:**
- **Repeatable items** (cards, slides, accordion, list rows) → model them as a **container block**, not a flat model: (a) a container definition whose \`template\` has a \`"filter"\` (not \`"model"\`), (b) an **item** definition with \`"resourceType": "core/franklin/components/block/v1/block/item"\` and its own \`model\`, (c) a \`filters\` entry \`{ "id": "${ctx.blockName}", "components": ["${ctx.blockName}-item"] }\`. The authored block renders **one row per item** — \`decorate()\` MUST iterate them: \`[...block.children].forEach((row) => { /* build one card */ })\`. A flat model with no iteration = a block that only ever shows one item.
- **Inline repeatable group** (e.g. 2–3 CTAs inside a hero) → a \`container\` field with \`"multi": true\` and nested \`fields\` (no child-block needed).
- **Dropdowns**: a \`select\`/\`radio-group\` value arrives as a cell in the authored DOM — read it in \`decorate()\` and act on it (e.g. read \`titleType\` and swap the heading tag to \`h1..h6\`). A \`multiselect\` named \`classes\` is applied as CSS classes on the block root automatically — just write \`.${ctx.blockName}.<value>\` styles; any other \`multiselect\`/\`checkbox-group\` arrives as a CSV cell you parse.
- **Self-check before finishing:** every field \`name\` in the model must be read by \`decorate()\` (or applied via \`classes\`). List each field and where the JS/CSS consumes it. Unconsumed fields = broken authoring.

If the project uses a **single aggregated model file** (\`component-definition.json\` + \`component-models.json\` + \`component-filters.json\`) instead of per-block \`_${ctx.blockName}.json\`, detect that convention and add the block's definition/model/filter to those files instead (and register the block in the \`section\` filter). Prefer the per-block \`_${ctx.blockName}.json\` when neither exists. Full field reference and a repeatable-cards round-trip example: \`docs/universal-editor-fields.md\`.

**Reusable field groups (partials):** when the design shows one of these common shapes, reuse the standard group instead of inventing fields — same groups \`eds model add\` uses, so the model stays consistent across the project:
${PARTIALS.map((p) => `- \`${p.id}\` — ${p.label}`).join("\n")}
`
		: "";

	const sourceLabel = design?.mode === "file" ? "a design export" : providerName;
	const designLabel = design?.mode === "file" ? "design" : `${providerName} design`;
	return `# Pixel-Perfect EDS Block from ${sourceLabel}

## Task
Generate an AEM Edge Delivery Services block named **\`${ctx.blockName}\`** that reproduces the ${designLabel} **1:1 — pixel perfect**. Exact spacing, colors, typography, and layout. Not "close enough" — identical.

${fetchSection}

## Step 2 — Extract Exact Values
From the design data you fetched, record the **precise** values — do not approximate:
1. **Layout**: Auto Layout direction, gap, padding, alignment → Flexbox/Grid with exact \`gap\`/\`padding\`
2. **Spacing**: every margin/padding in px — convert to \`rem\` (÷16) or reuse a matching project token
3. **Colors**: exact hex / token for every fill, stroke, shadow — prefer bound variables over raw hex
4. **Typography**: font-family, font-size, font-weight, line-height, letter-spacing per text layer. If the design uses a font **not already loaded by the project**, add it to the project's font pipeline (\`styles/fonts.css\` / \`loadFonts\` in \`scripts/scripts.js\`, or a \`<link>\` managed by EDS) — **never** \`@import\` or a third-party \`<link>\` inside the block CSS (it is render-blocking and fails the loading audit). Always declare a sensible fallback stack.
5. **Dimensions**: fixed vs. fluid (\`Fill\`→fluid, \`Hug\`→auto, fixed px→fixed) and border-radius
6. **Effects**: box-shadow, blur, opacity, gradients — replicate exactly

## Step 3 — Map to Semantic EDS Structure
- Map layer names/roles to semantic HTML (\`<h1>\`/\`<h2>\` by text-style level, \`<p>\`, \`<a class="button">\`, \`<picture>\`, \`<figure>\`, \`<nav>\`…)
- A \`decorate(block)\` function receives a \`<div class="${ctx.blockName}">\` whose children are the **authored content** coming from the document (EDS block table rows → nested divs). Your job is to read that existing DOM and enhance/restructure it — **not** to hardcode copy.
- Assume one row per logical content group; the first cell of each row holds the content. Normalize whatever markup EDS hands you.
- Map Figma component **variant properties** to modifier classes on the block root (e.g. \`Theme=dark\` → \`.${ctx.blockName}.dark\`, \`Layout=centered\` → \`.${ctx.blockName}.centered\`). Read variants via metadata; handle each in CSS.
- Follow any Figma **annotations** for behavior (autoplay, collapsed-by-default, load eagerly, truncation, tab order).

## Step 4 — Generate Block Files

Create these files in \`blocks/${ctx.blockName}/\`:

### \`${ctx.blockName}.js\`
\`\`\`javascript
// EDS block: ${ctx.blockName}
// Generated from Figma design
export default function decorate(block) {
  // - Vanilla JS only (no frameworks)
  // - Read the authored children already inside \`block\`; restructure into semantic HTML
  // - Add class names prefixed with "${ctx.blockName}-"
  // - Wire interactions from Figma annotations (if any)
  // - Eager-load above-fold images, lazy-load below-fold
}
\`\`\`

### \`${ctx.blockName}.css\`
\`\`\`css
/* EDS block: ${ctx.blockName} */
/* Map Figma design tokens to CSS custom properties; reuse project tokens below where they match */
/* Mobile-first; exact values from Step 2 */
\`\`\`
${ueModelSection}${contentSourceSection}
## Placeholders & assets — be visible before Universal Editor takes over
Content images and copy come from **authoring** (the document / DAM via UE), not the repo. Do **not** ship design-tool / scraped CDN URLs (Figma, Framer and Stitch asset links are short-lived) and do **not** bundle content photos into the repo.
- In \`decorate()\`, read the image/text from the authored DOM. When none is present yet, render a lightweight **placeholder** so the block is visible *before* an author sets the real content: an inline SVG data-URI grey box (or a CSS placeholder) at the correct \`aspect-ratio\`, and sensible placeholder copy.
- Provide the mock for the preview in \`blocks/${ctx.blockName}/_${ctx.blockName}.preview.html\` (used by \`eds block preview\`). Keep placeholder copy there, not hardcoded in the block. **This file must be a bare block fragment only** — just the authored \`<div class="${ctx.blockName} block">…</div>\` markup that \`decorate()\` consumes. Do **not** wrap it in \`<!DOCTYPE>\`, \`<html>\`, \`<head>\`, \`<body>\`, \`<link>\`, \`<style>\` or \`<script>\`; the preview harness supplies the page, the block CSS and the \`decorate()\` call itself. A full HTML document here renders as a blank preview.
- Only bundle genuinely **static, decorative** assets (e.g. a small icon) as an optimized inline/\`icons/\` **SVG**, referenced by project-relative path. Never bundle authorable content images.
- Always set \`width\`/\`height\` or \`aspect-ratio\` to avoid CLS.

${verifyStep}

## EDS Block Conventions
- **Full-width by default**: the block/section spans the **full viewport width** (full-bleed) — never a fixed or centered fixed-width box. Constrain only the *inner content* to a sensible \`max-width\` (centered) for line-length/readability, with fluid horizontal padding. The design frame's width (e.g. 1280px) is the content cap, not the section width.
- **Mobile-first & fluid**: base styles target the smallest screen; layer breakpoints upward. The section must look right at any width, not only the design frame's.
- **No frameworks**: vanilla JS and CSS only
- **Self-contained JS**: the block's \`.js\` must run on its own. Do **not** \`import\` from \`scripts/\` or other blocks (no analytics/tracking/aem helpers) — a missing module makes the whole block fail to load and renders blank. No analytics/tracking code unless explicitly requested.
- **\`decorate(block)\`**: enhance the authored DOM; never inject hardcoded copy that should be authored
- **Semantic HTML**: correct elements and heading hierarchy
- **Class naming**: prefix all classes with the block name: \`.${ctx.blockName}-item\`, \`.${ctx.blockName}-title\`
- **Loading strategy**: eager (above-fold/hero), lazy (below-fold/carousels), delayed (analytics)
- **Images**: always \`alt\` (empty for decorative), \`<picture>\` with WebP where applicable
- **Accessibility**: ARIA where needed, keyboard navigation, focus states matching the design
- **Performance**: no heavy dependencies, minimal DOM work, CSS for animations
${tokensHint}

## Output Requirements
1. All files in \`blocks/${ctx.blockName}/\`${ctx.withUeModel ? ` — JS, CSS **and** the Universal Editor model (\`_${ctx.blockName}.json\`)` : ""}
2. Production-ready, Lighthouse-friendly (aim for 100), no \`console.log\`
3. Brief inline comments only for non-obvious logic
4. **Minimise chat output (save tokens):** write the files directly with your editing tools — do **not** paste the generated code back into the chat, and skip step-by-step narration. End with a **≤3-line** summary: files created + any value you had to infer.
   - **No shell access:** you can only read/write files and call the design MCP. Do **not** run \`eslint\`, \`stylelint\`, \`npm\`, \`npx\`, \`tsc\`, a build, or any shell/Bash command — those tools aren't granted and the attempts just fail and waste time. Write valid, clean, correctly-formatted files directly; linting/formatting is the project's job, not yours.
5. Mobile-first CSS with breakpoints at 600px and 900px
6. Prefer existing project tokens over new hardcoded values${ctx.withUeModel ? "\n7. UE model field `name`s must match what `decorate()` reads, and every Figma variant must appear as a select option wired to a CSS modifier" : ""}${
		ctx.contentSource === "cf" || ctx.contentSource === "mixed"
			? `
8. **Content Fragment (hard requirement - the CLI checks it):** the model has an \`aem-content-fragment\` field, and \`decorate(block)\` is \`async\` and \`fetch()\`es that fragment's data (GraphQL persisted query) before building the DOM. A block that only reads inline cells fails verification.`
			: ""
	}

Finally, record the design's frame width(s) you read in Step 1 into \`blocks/${ctx.blockName}/.eds-meta.json\` as \`{ "breakpoints": [{ "width": <px>, "source": "${design?.mode === "scrape" ? "scrape" : provider}" }] }\` (one entry per distinct frame width). The CLI merges this so \`eds block preview\` shows the block at the **real design widths**, not a fixed device set.

---
*Prompt version: ${PROMPT_VERSION}*
`;
}

export interface RefineContext {
	blockName: string;
	/** The author's requested change, in their own words. */
	feedback: string;
	provider?: DesignProvider;
	figma?: FigmaUrlParts | null;
	designRef?: string;
}

/**
 * A short follow-up prompt for the human-in-the-loop refine step: the block
 * already exists and the author has reviewed it in the live preview. Apply
 * exactly their requested change in one focused pass — no full regeneration,
 * no verification loop, no shell.
 */
export function buildRefinePrompt(ctx: RefineContext): string {
	const provider = ctx.provider ?? "figma";
	const designHint =
		provider === "figma" && ctx.figma?.fileKey
			? `If the change needs design values, re-read **only what you need** from Figma (fileKey \`${ctx.figma.fileKey}\`${ctx.figma.nodeId ? `, node \`${ctx.figma.nodeId}\`` : ""}) — don't re-fetch the whole design.`
			: "Use the values already in the files (and the cached design snapshot under `tmp/eds-cli/design-cache/` if present); infer sensibly if the request is purely stylistic.";

	return `# Refine the \`${ctx.blockName}\` EDS block

The block already exists in \`blocks/${ctx.blockName}/\` and the author reviewed it in the live preview. Apply **this change** and nothing else:

> ${ctx.feedback.split("\n").join("\n> ")}

## How to work
1. **Read the current files first** (\`blocks/${ctx.blockName}/${ctx.blockName}.js\`, \`${ctx.blockName}.css\`, and \`_${ctx.blockName}.json\` if present). Edit them in place — do **not** rewrite from scratch or regenerate unrelated parts.
2. Make the smallest change that satisfies the request. Keep everything else byte-for-byte unless the change requires otherwise.
3. Preserve the EDS conventions already in place: full-width section / constrained inner content, mobile-first, vanilla JS/CSS, block-prefixed class names, \`decorate(block)\` reads authored DOM (no hardcoded copy), accessibility, no \`console.log\`. If the block has a UE model, keep field \`name\`s and \`decorate()\` in sync.
4. ${designHint || "Use the values already in the files; infer sensibly if the request is purely stylistic."}

## Constraints
- **One pass, then stop** — apply the change, don't loop or re-verify to "pixel perfect"; the author re-checks in the preview and may ask again.
- **No shell access:** only read/write files${provider === "figma" ? " and call the Figma MCP" : ""}. Do **not** run \`eslint\`, \`stylelint\`, \`npm\`, \`npx\`, \`tsc\`, a build, or any Bash command — they aren't granted and just fail.
- **Minimise chat output:** edit files directly, don't paste code back. End with a **≤2-line** summary of what changed.

*Prompt version: ${PROMPT_VERSION}*
`;
}

async function getTokensHint(projectRoot: string): Promise<string> {
	const stylesPath = path.join(projectRoot, "styles", "styles.css");
	if (!existsSync(stylesPath)) return "";

	try {
		const css = await readFile(stylesPath, "utf-8");
		// Extract CSS custom properties from :root
		const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
		if (!rootMatch) return "";

		const props = rootMatch[1]
			.split("\n")
			.filter((line) => line.trim().startsWith("--"))
			.map((line) => line.trim())
			.join("\n  ");

		if (!props) return "";

		return `
## Existing Project Tokens
The project already defines these CSS custom properties in \`styles/styles.css\`.
Reuse them instead of hardcoding values:

\`\`\`css
:root {
  ${props}
}
\`\`\`
`;
	} catch {
		return "";
	}
}
