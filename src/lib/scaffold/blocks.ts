/**
 * Standard block library, modelled on the AEM Block Collection. Each block is
 * self-contained: `<name>.js`, `<name>.css`, and a distributed `_<name>.json`
 * (definitions / models / filters) so it's authorable in the Universal Editor.
 * Container blocks (cards, columns, accordion) use the child-item multifield
 * pattern. Scaffolding registers each block id in the central `section` filter.
 */

export interface BlockTemplate {
	id: string;
	title: string;
	js: string;
	css: string;
	/** Contents of `_<name>.json`. */
	model: string;
}

function json(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

const blockDef = (title: string, id: string, model: string) => ({
	title,
	id,
	plugins: {
		xwalk: {
			page: {
				resourceType: "core/franklin/components/block/v1/block",
				template: { name: title, model },
			},
		},
	},
});

const containerDef = (title: string, id: string, filter: string) => ({
	title,
	id,
	plugins: {
		xwalk: {
			page: {
				resourceType: "core/franklin/components/block/v1/block",
				template: { name: title, filter },
			},
		},
	},
});

const itemDef = (title: string, id: string, model: string) => ({
	title,
	id,
	plugins: {
		xwalk: {
			page: {
				resourceType: "core/franklin/components/block/v1/block/item",
				template: { name: title, model },
			},
		},
	},
});

export const STANDARD_BLOCKS: BlockTemplate[] = [
	// ── hero ──────────────────────────────────────────────
	{
		id: "hero",
		title: "Hero",
		js: `// Block: hero
export default function decorate(block) {
  block.classList.add('hero');
  const picture = block.querySelector('picture');
  if (picture) picture.closest('div')?.classList.add('hero-image');
}
`,
		css: `/* Block: hero */
.hero {
  position: relative;
  display: grid;
  min-height: 60vh;
  align-content: center;
}

.hero .hero-image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -1;
}

.hero h1,
.hero p {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 var(--spacing-m, 16px);
}
`,
		model: json({
			definitions: [blockDef("Hero", "hero", "hero")],
			models: [
				{
					id: "hero",
					fields: [
						{ component: "reference", valueType: "string", name: "image", label: "Image" },
						{ component: "text", valueType: "string", name: "imageAlt", label: "Alt" },
						{ component: "text", valueType: "string", name: "title", label: "Title" },
						{ component: "richtext", valueType: "string", name: "text", value: "", label: "Text" },
					],
				},
			],
			filters: [],
		}),
	},

	// ── cards (container / multifield) ────────────────────
	{
		id: "cards",
		title: "Cards",
		js: `// Block: cards
export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((cell) => {
      cell.className = cell.querySelector('picture') ? 'cards-card-image' : 'cards-card-body';
    });
    ul.append(li);
  });
  block.textContent = '';
  block.append(ul);
}
`,
		css: `/* Block: cards */
.cards ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--spacing-m, 16px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cards li {
  border: 1px solid var(--color-line, #e5e5e5);
  border-radius: 12px;
  overflow: hidden;
}

.cards .cards-card-image img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.cards .cards-card-body {
  padding: var(--spacing-m, 16px);
}
`,
		model: json({
			definitions: [containerDef("Cards", "cards", "cards"), itemDef("Card", "card", "card")],
			models: [
				{
					id: "card",
					fields: [
						{ component: "reference", valueType: "string", name: "image", label: "Image" },
						{ component: "text", valueType: "string", name: "imageAlt", label: "Alt" },
						{ component: "text", valueType: "string", name: "title", label: "Title" },
						{ component: "richtext", valueType: "string", name: "text", value: "", label: "Text" },
						{ component: "aem-content", name: "link", label: "Link" },
					],
				},
			],
			filters: [{ id: "cards", components: ["card"] }],
		}),
	},

	// ── columns ───────────────────────────────────────────
	{
		id: "columns",
		title: "Columns",
		js: `// Block: columns
export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(\`columns-\${cols.length}-cols\`);
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic && pic.closest('div') === col) col.classList.add('columns-img-col');
    });
  });
}
`,
		css: `/* Block: columns */
.columns > div {
  display: grid;
  gap: var(--spacing-l, 32px);
}

@media (width >= 900px) {
  .columns > div {
    grid-template-columns: repeat(var(--columns, 2), 1fr);
  }
  .columns-2-cols > div { --columns: 2; }
  .columns-3-cols > div { --columns: 3; }
  .columns-4-cols > div { --columns: 4; }
}

.columns img { width: 100%; height: auto; }
`,
		model: json({
			definitions: [blockDef("Columns", "columns", "columns")],
			models: [
				{
					id: "columns",
					fields: [
						{
							component: "richtext",
							valueType: "string",
							name: "content",
							value: "",
							label: "Content",
						},
					],
				},
			],
			filters: [],
		}),
	},

	// ── accordion (container / <details>) ─────────────────
	{
		id: "accordion",
		title: "Accordion",
		js: `// Block: accordion
export default function decorate(block) {
  [...block.children].forEach((row) => {
    const [label, body] = row.children;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'accordion-item-label';
    if (label) summary.append(...label.childNodes);
    const content = document.createElement('div');
    content.className = 'accordion-item-body';
    if (body) content.append(...body.childNodes);
    details.append(summary, content);
    row.replaceWith(details);
  });
}
`,
		css: `/* Block: accordion */
.accordion details {
  border-bottom: 1px solid var(--color-line, #e5e5e5);
}

.accordion summary {
  cursor: pointer;
  padding: var(--spacing-m, 16px) 0;
  font-weight: 600;
  list-style: none;
}

.accordion summary::after { content: '+'; float: right; }
.accordion details[open] summary::after { content: '−'; }

.accordion .accordion-item-body {
  padding-bottom: var(--spacing-m, 16px);
}
`,
		model: json({
			definitions: [
				containerDef("Accordion", "accordion", "accordion"),
				itemDef("Accordion Item", "accordion-item", "accordion-item"),
			],
			models: [
				{
					id: "accordion-item",
					fields: [
						{ component: "text", valueType: "string", name: "label", label: "Label" },
						{ component: "richtext", valueType: "string", name: "body", value: "", label: "Body" },
					],
				},
			],
			filters: [{ id: "accordion", components: ["accordion-item"] }],
		}),
	},

	// ── embed ─────────────────────────────────────────────
	{
		id: "embed",
		title: "Embed",
		js: `// Block: embed
export default function decorate(block) {
  const link = block.querySelector('a');
  const url = link?.href;
  block.textContent = '';
  if (!url) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'embed-wrapper';
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.loading = 'lazy';
  iframe.title = 'Embedded content';
  iframe.setAttribute('allow', 'encrypted-media; fullscreen');
  wrapper.append(iframe);
  block.append(wrapper);
}
`,
		css: `/* Block: embed */
.embed .embed-wrapper {
  position: relative;
  aspect-ratio: 16 / 9;
}

.embed iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
`,
		model: json({
			definitions: [blockDef("Embed", "embed", "embed")],
			models: [
				{
					id: "embed",
					fields: [{ component: "aem-content", name: "link", label: "Embed URL" }],
				},
			],
			filters: [],
		}),
	},
];

export function blockById(id: string): BlockTemplate | undefined {
	return STANDARD_BLOCKS.find((b) => b.id === id);
}
