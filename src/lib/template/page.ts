/**
 * Build EDS page "initial content" (the document HTML an authoring source
 * stores): a `<main>` of sections, each a chosen block rendered as the
 * franklin row/cell div structure, plus a trailing `metadata` block. This is
 * the EDS analog of an AEM template's initial content.
 */

export interface PageTemplateOptions {
	title: string;
	description?: string;
	/** Block ids to seed as empty sections (e.g. hero, cards). */
	blocks?: string[];
	/** Site area / template label, stored in the metadata block. */
	area?: string;
}

/** One block rendered as a single placeholder row/cell (authors fill it in). */
function blockDiv(name: string): string {
	return `      <div class="${name}">
        <div>
          <div>${name} content</div>
        </div>
      </div>`;
}

/** The page metadata block (Title / Description / optional Template). */
function metadataBlock(opts: PageTemplateOptions): string {
	const rows = [
		`          <div><div>Title</div><div>${opts.title}</div></div>`,
		`          <div><div>Description</div><div>${opts.description ?? ""}</div></div>`,
	];
	if (opts.area) rows.push(`          <div><div>Template</div><div>${opts.area}</div></div>`);
	return `      <div class="metadata">
${rows.join("\n")}
      </div>`;
}

/** Render the full document HTML for a page template. */
export function buildPageHtml(opts: PageTemplateOptions): string {
	const blocks = opts.blocks ?? [];
	const intro = `    <div>
      <h1>${opts.title}</h1>
      <p>${opts.description ?? "Intro copy goes here."}</p>
    </div>`;
	const blockSections = blocks.map((b) => `    <div>\n${blockDiv(b)}\n    </div>`);
	const metaSection = `    <div>\n${metadataBlock(opts)}\n    </div>`;

	return `<body>
  <header></header>
  <main>
${[intro, ...blockSections, metaSection].join("\n")}
  </main>
  <footer></footer>
</body>
`;
}
