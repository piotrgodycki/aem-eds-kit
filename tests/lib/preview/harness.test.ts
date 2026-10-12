import { describe, expect, it } from "vitest";
import { type Breakpoint, buildInner } from "../../../src/lib/preview/harness.js";

const BP: Breakpoint[] = [{ width: 1280, label: "1280 desktop", figma: true }];

function inner(sample: string): string {
	return buildInner({
		blockName: "hero",
		breakpoints: BP,
		sampleContent: sample,
		frameRoute: "/__eds_preview_frame",
	});
}

describe("preview harness — sample fragment sanitising", () => {
	it("keeps a bare block fragment intact", () => {
		const html = inner('<div class="hero block"><div><div><h2>Hi</h2></div></div></div>');
		expect(html).toContain('<div class="hero block">');
		expect(html).toContain("<h2>Hi</h2>");
	});

	it("reduces a full HTML document to just its body contents (white-screen fix)", () => {
		const fullDoc = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="../../../styles/styles.css" />
  <style>body { background: #ffffff; }</style>
</head>
<body>
  <!-- a comment -->
  <div class="hero block"><h2>Title</h2></div>
  <script>console.log('nope');</script>
</body>
</html>`;
		const html = inner(fullDoc);
		const bodyOpen = html.indexOf(">", html.indexOf("<body")) + 1;
		const body = html.slice(bodyOpen, html.indexOf("</body>"));

		// The authored block survives…
		expect(body).toContain('<div class="hero block">');
		expect(body).toContain("<h2>Title</h2>");
		// …but the document scaffolding injected by the agent is gone.
		expect(body).not.toMatch(/<html|<head|<\/head>|<\/html>/i);
		expect(body).not.toContain("background: #ffffff");
		expect(body).not.toContain('styles.css" />'); // the mock's own <link> is stripped
		expect(body).not.toContain("console.log");
		expect(body).not.toContain("<!-- a comment -->");
	});

	it("loads project styles.css and the block css in the frame head", () => {
		const html = inner('<div class="hero block"></div>');
		expect(html).toContain('<link rel="stylesheet" href="/styles/styles.css" />');
		expect(html).toContain('<link rel="stylesheet" href="/blocks/hero/hero.css" />');
	});

	it("reveals the body past the EDS body.appear visibility gate", () => {
		// styles.css hides the body until scripts.js adds .appear; the preview
		// doesn't run scripts.js, so the harness must reveal it itself.
		const html = inner('<div class="hero block"></div>');
		expect(html).toContain('<body class="appear">');
		expect(html).toContain("display:block!important");
	});

	it("loads the block script defensively so a bad import doesn't blank the frame", () => {
		const html = inner('<div class="hero block"></div>');
		// Dynamic import wrapped in try/catch, not a bare top-level import.
		expect(html).toContain("await import('/blocks/hero/hero.js')");
		expect(html).toContain("catch");
	});
});
