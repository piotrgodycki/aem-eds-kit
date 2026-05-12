import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FigmaUrlParts } from "../schemas.js";

const PROMPT_VERSION = "0.1.0";

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

	return `# EDS Block Generation from Figma Design

## Task
Generate an AEM Edge Delivery Services block named **\`${ctx.blockName}\`** based on the Figma design.

## Step 1 — Fetch the Design
Call the Figma MCP tool \`get_design_context\` with:
- fileKey: \`${ctx.figma.fileKey}\`
${ctx.figma.nodeId ? `- nodeId: \`${ctx.figma.nodeId}\`` : "- (no nodeId — use the full page)"}

${nodeIdInstruction}

Also call \`get_variable_defs\` for the same fileKey to retrieve design tokens.

## Step 2 — Analyze the Design
From the Figma response:
1. Identify the visual structure, layout, and components
2. Map Figma layers to semantic HTML elements
3. Note colors, typography, spacing from design tokens or raw values
4. Note any images that need alt text

## Step 3 — Generate Block Files

Create the following files in \`blocks/${ctx.blockName}/\`:

### \`${ctx.blockName}.js\`
\`\`\`javascript
// EDS block: ${ctx.blockName}
// Generated from Figma design
export default function decorate(block) {
  // Your implementation here
  // - Use vanilla JS only (no frameworks)
  // - Use semantic HTML
  // - Add class names prefixed with "${ctx.blockName}-"
  // - Handle responsive behavior
  // - Use eager loading for above-fold images, lazy for below-fold
}
\`\`\`

### \`${ctx.blockName}.css\`
\`\`\`css
/* EDS block: ${ctx.blockName} */
/* Map Figma design tokens to CSS custom properties where possible */
/* Use existing project tokens if they match (see below) */
/* Mobile-first responsive approach */
\`\`\`
${ueModelSection}
## EDS Block Conventions

- **No frameworks**: vanilla JS and CSS only
- **\`decorate(block)\` pattern**: the function receives a \`<div>\` with content already in it from the document markup. Transform/enhance it.
- **Semantic HTML**: use appropriate elements (\`<nav>\`, \`<section>\`, \`<figure>\`, etc.)
- **Class naming**: prefix all classes with the block name: \`.${ctx.blockName}-item\`, \`.${ctx.blockName}-title\`
- **Loading strategy**:
  - Eager: hero images, above-fold content
  - Lazy: below-fold images, carousels
  - Delayed: analytics, tracking, non-critical JS
- **Images**: always include \`alt\` attributes, use \`<picture>\` with WebP where applicable
- **Accessibility**: ARIA labels, keyboard navigation, proper heading hierarchy
- **Performance**: no heavy dependencies, minimal DOM manipulation, use CSS for animations
${tokensHint}

## Output Requirements
1. Place all files in \`blocks/${ctx.blockName}/\`
2. Code must be production-ready and Lighthouse-friendly (aim for 100)
3. Include brief inline comments explaining non-obvious logic
4. CSS should be mobile-first with breakpoints at 600px and 900px

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
