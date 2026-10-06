import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FigmaUrlParts } from "../schemas.js";

const PROMPT_VERSION = "0.4.2";

export { PROMPT_VERSION };

export type ContentSource = "document" | "ue" | "cf" | "mixed";

export interface PromptContext {
	figma: FigmaUrlParts;
	blockName: string;
	projectRoot: string;
	withUeModel: boolean;
	/** Where the block's content comes from. Defaults to document authoring. */
	contentSource?: ContentSource;
	/** Optional CF model / GraphQL persisted-query hint (for cf/mixed). */
	cfHint?: string;
	/** Fetch a screenshot for pixel verification. Defaults to true. Off = fewer input tokens. */
	screenshot?: boolean;
	existingTokens?: string;
}

/** Guidance for Content-Fragment-backed and mixed (UE + CF) blocks. */
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
	const withScreenshot = ctx.screenshot !== false;
	const verifyStep = withScreenshot
		? `## Step 5 — Pixel-Perfect Self-Verification (do not skip)
After writing the files, **verify against the screenshot from Step 1**:
1. Re-open the \`get_screenshot\` image and compare it to your implementation region by region.
2. Check each axis: spacing, font sizes/weights/line-heights, colors, border-radius, shadows, alignment, and overall proportions.
3. For every mismatch, adjust the CSS and re-check. Repeat until the rendered block is indistinguishable from the screenshot.
4. Briefly state what you verified and any value you had to infer.`
		: `## Step 5 — Structural Self-Verification (do not skip)
No screenshot was fetched (token-lean mode). Verify against the **exact values from \`get_design_context\`**:
1. Re-check every extracted value (spacing, fonts, colors, radius, shadows, alignment) against your CSS.
2. Fix any mismatch.
3. Briefly state what you verified and any value you had to infer.`;

	const nodeIdInstruction = ctx.figma.nodeId
		? `Use node ID \`${ctx.figma.nodeId}\` in file \`${ctx.figma.fileKey}\`.`
		: `Use file key \`${ctx.figma.fileKey}\` (no specific node selected — analyze the full page or ask the user to select a frame).`;

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
`
		: "";

	return `# Pixel-Perfect EDS Block from Figma Design

## Task
Generate an AEM Edge Delivery Services block named **\`${ctx.blockName}\`** that reproduces the Figma design **1:1 — pixel perfect**. Exact spacing, colors, typography, and layout. Not "close enough" — identical.

## Step 1 — Fetch the Design
Call the Figma MCP tools for this selection:
- \`get_design_context\` — structure, layout, measurements, text content
- \`get_variable_defs\` — design tokens (variables) to map to CSS custom properties
${withScreenshot ? "- `get_screenshot` — the ground-truth visual reference for Step 5. Request it at `maxDimension: 1024` (enough to verify; do not request larger)." : "- (screenshot skipped to save tokens — pass `excludeScreenshot: true` to `get_design_context`)"}

**Token efficiency:** call each tool **once** for the target node only — don't re-fetch and don't walk sibling/parent nodes you don't need.${withScreenshot ? "" : " You will verify structurally against the `get_design_context` measurements, not a picture."}

Target:
- fileKey: \`${ctx.figma.fileKey}\`
${ctx.figma.nodeId ? `- node: \`${ctx.figma.nodeId}\`` : "- (no node selected — use the full page)"}

${nodeIdInstruction}

## Step 2 — Extract Exact Values
From \`get_design_context\`, record the **precise** values — do not approximate:
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
## Assets — download them into the project
Any image / icon / media the design references must be **saved into the repo** so the block renders everywhere, not just in a preview. Design-tool CDN URLs (Figma, Google Stitch, etc.) are short-lived and must **not** be shipped.
- Get the asset download URLs from \`get_design_context\` (its assets / download map) or export them via the Figma MCP, and download each one (e.g. with \`curl\`).
- Save block-scoped images to \`blocks/${ctx.blockName}/\` (e.g. \`blocks/${ctx.blockName}/hero-bg.png\`); save reusable SVG icons to \`icons/\`. Prefer optimized formats (WebP/AVIF for photos, SVG for icons).
- Reference assets by **project-relative path** (\`url("./hero-bg.png")\` in the block CSS, \`/icons/…\` for shared icons) — never the design-tool CDN URL.
- Add \`width\`/\`height\` or \`aspect-ratio\` to avoid CLS; lazy-load below-the-fold images.

${verifyStep}

## EDS Block Conventions
- **Full-width by default**: the block/section spans the **full viewport width** (full-bleed) — never a fixed or centered fixed-width box. Constrain only the *inner content* to a sensible \`max-width\` (centered) for line-length/readability, with fluid horizontal padding. The design frame's width (e.g. 1280px) is the content cap, not the section width.
- **Mobile-first & fluid**: base styles target the smallest screen; layer breakpoints upward. The section must look right at any width, not only the design frame's.
- **No frameworks**: vanilla JS and CSS only
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
5. Mobile-first CSS with breakpoints at 600px and 900px
6. Prefer existing project tokens over new hardcoded values${ctx.withUeModel ? "\n7. UE model field `name`s must match what `decorate()` reads, and every Figma variant must appear as a select option wired to a CSS modifier" : ""}

---
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
