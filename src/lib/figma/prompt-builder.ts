import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FigmaUrlParts } from "../schemas.js";

const PROMPT_VERSION = "0.2.2";

export { PROMPT_VERSION };

export interface PromptContext {
	figma: FigmaUrlParts;
	blockName: string;
	projectRoot: string;
	withUeModel: boolean;
	existingTokens?: string;
}

export async function buildPrompt(ctx: PromptContext): Promise<string> {
	const tokensHint = await getTokensHint(ctx.projectRoot);

	const nodeIdInstruction = ctx.figma.nodeId
		? `Use node ID \`${ctx.figma.nodeId}\` in file \`${ctx.figma.fileKey}\`.`
		: `Use file key \`${ctx.figma.fileKey}\` (no specific node selected — analyze the full page or ask the user to select a frame).`;

	const ueModelSection = ctx.withUeModel
		? `
## Universal Editor Model

Generate a \`_${ctx.blockName}.json\` file with the component model definition for Universal Editor.
Follow the standard AEM EDS model format with fields, fieldGroups, and appropriate input types.
`
		: "";

	return `# Pixel-Perfect EDS Block from Figma Design

## Task
Generate an AEM Edge Delivery Services block named **\`${ctx.blockName}\`** that reproduces the Figma design **1:1 — pixel perfect**. Exact spacing, colors, typography, and layout. Not "close enough" — identical.

## Step 1 — Fetch the Design (all three sources)
Call the Figma MCP tools for this selection:
- \`get_design_context\` — structure, layout, measurements, text content
- \`get_variable_defs\` — design tokens (variables) to map to CSS custom properties
- \`get_screenshot\` — **the ground-truth visual reference you will compare against in Step 5**

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
${ueModelSection}
## Step 5 — Pixel-Perfect Self-Verification (do not skip)
After writing the files, **verify against the screenshot from Step 1**:
1. Re-open the \`get_screenshot\` image and compare it to your implementation region by region.
2. Check each axis: spacing, font sizes/weights/line-heights, colors, border-radius, shadows, alignment, and overall proportions.
3. For every mismatch, adjust the CSS and re-check. Repeat until the rendered block is indistinguishable from the screenshot.
4. State explicitly what you verified and any value you had to infer (missing token, ambiguous constraint).

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
1. All files in \`blocks/${ctx.blockName}/\`
2. Production-ready, Lighthouse-friendly (aim for 100), no \`console.log\`
3. Brief inline comments only for non-obvious logic
4. Mobile-first CSS with breakpoints at 600px and 900px
5. Prefer existing project tokens over new hardcoded values

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
