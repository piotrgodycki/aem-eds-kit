/**
 * Content / link / a11y checks run against a block's *rendered* DOM (after
 * decorate), using Playwright. The audit runs in the browser as a string
 * expression (so the DOM code isn't type-checked/linted as Node code) and
 * returns a list of findings.
 */

const INSTALL_HINT =
	"Content checks need Playwright. Install it with:\n" +
	"  npm i -D playwright && npx playwright install chromium";

export interface Finding {
	level: "error" | "warn";
	rule: string;
	detail: string;
}

/**
 * Browser-side audit (evaluated as an expression). Scoped to the block root.
 * - img-alt   : <img> without an alt attribute (use alt="" if decorative)
 * - img-cls   : <img> without width/height or an aspect-ratio (layout shift)
 * - link-name : <a> with no accessible name (text / aria-label / title / img alt)
 * - link-href : <a> with an empty or missing href
 * - button-name: <button> with no accessible name
 * - inline-handler: element with an inline on* handler (CSP / best practice)
 * - mock-nesting: (authored mock, before decorate) cells that wrap their content
 *   in an extra <div> - EDS delivers row > cell > content, so decorate() written
 *   against the mock misreads real content (and vice versa)
 */
const AUDIT_SRC = `(() => {
  const out = [];
  const root = document.querySelector('[class$="block"]') || document.body;
  const trunc = (s) => (s || '').slice(0, 60);
  const accName = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (t) return t;
    const img = el.querySelector('img');
    if (img && (img.getAttribute('alt') || '').trim()) return img.getAttribute('alt').trim();
    return (el.getAttribute('title') || '').trim();
  };
  for (const img of root.querySelectorAll('img')) {
    const src = trunc(img.getAttribute('src'));
    if (!img.hasAttribute('alt')) out.push({ level: 'warn', rule: 'img-alt', detail: '<img> without alt (use alt="" if decorative): ' + src });
    // A rendered <img> always has a computed px height, so look for what
    // actually reserves its box: width/height attributes, an aspect-ratio, or a
    // stylesheet height on the image.
    const cs = getComputedStyle(img);
    const cssHeight = [...document.styleSheets].some((sheet) => {
      let rules;
      try { rules = sheet.cssRules; } catch { return false; }
      return [...rules].some((r) => {
        const h = r.style && r.style.height;
        return h && h !== 'auto' && r.selectorText && img.matches(r.selectorText);
      });
    });
    const hasDims = (img.hasAttribute('width') && img.hasAttribute('height'))
      || (cs.aspectRatio && cs.aspectRatio !== 'auto')
      || (img.style.height && img.style.height !== 'auto')
      || cssHeight;
    if (!hasDims) out.push({ level: 'warn', rule: 'img-cls', detail: '<img> without width/height or aspect-ratio (CLS risk): ' + src });
  }
  for (const a of root.querySelectorAll('a')) {
    if (!accName(a)) out.push({ level: 'error', rule: 'link-name', detail: '<a> with no accessible name, href=' + trunc(a.getAttribute('href')) });
    const href = a.getAttribute('href');
    if (href === null || href === '') out.push({ level: 'warn', rule: 'link-href', detail: '<a> with empty or missing href' });
  }
  for (const b of root.querySelectorAll('button')) {
    if (!accName(b)) out.push({ level: 'error', rule: 'button-name', detail: '<button> with no accessible name' });
  }
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.getAttributeNames()) {
      if (attr.startsWith('on')) { out.push({ level: 'warn', rule: 'inline-handler', detail: '<' + el.tagName.toLowerCase() + '> has inline ' + attr }); break; }
    }
  }
  return out;
})()`;

/**
 * Browser-side check of the authored mock (`_<name>.preview.html`), parsed as-is
 * before decorate(). Called with the mock HTML as its argument.
 */
const MOCK_NESTING_SRC = `(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.block') || doc.body.firstElementChild;
  if (!root) return [];
  let wrapped = 0, cells = 0;
  for (const row of root.children) {
    for (const cell of row.children) {
      cells++;
      const only = cell.children.length === 1 ? cell.firstElementChild : null;
      const ownText = [...cell.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (only && only.tagName === 'DIV' && !ownText) wrapped++;
    }
  }
  return wrapped ? [{ level: 'warn', rule: 'mock-nesting', detail: wrapped + ' of ' + cells + ' cells in the preview mock wrap their content in an extra <div>; EDS delivers row > cell > content' }] : [];
}`;

/** Render a block route and run the content/a11y audit against its DOM (and its mock, if given). */
export async function auditRoute(
	url: string,
	width: number,
	mockHtml?: string,
): Promise<Finding[]> {
	// biome-ignore lint/suspicious/noExplicitAny: optional dep, no types installed
	let chromium: any;
	try {
		const specifier = "playwright";
		({ chromium } = await import(specifier));
	} catch {
		throw new Error(INSTALL_HINT);
	}
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width, height: 900 } });
		await page.goto(url, { waitUntil: "networkidle" });
		await page.waitForTimeout(200); // let decorate() settle
		const findings = (await page.evaluate(AUDIT_SRC)) as Finding[];
		if (mockHtml) {
			findings.push(
				...((await page.evaluate(
					`(${MOCK_NESTING_SRC})(${JSON.stringify(mockHtml)})`,
				)) as Finding[]),
			);
		}
		return findings;
	} finally {
		await browser.close();
	}
}
