/**
 * Generates the in-memory HTML for `eds block preview`.
 *
 * Two documents are produced:
 *  - `inner`: renders ONLY the block (authored content + its CSS + decorate).
 *    Loaded inside an <iframe> whose width is the chosen breakpoint, so the
 *    block's media queries fire against that width, not the real monitor.
 *  - `outer`: neutral grayscale chrome: a breakpoint dropdown and an optional
 *    "Open in Figma" link. Deliberately colourless so it never tints the
 *    perception of the design being previewed.
 *
 * Asset paths are root-absolute (`/blocks/<name>/...`) so they resolve no
 * matter which route serves the HTML.
 */

export interface Breakpoint {
	width: number;
	label: string;
	/** True if this width has a real Figma frame behind it (pixel-perfect). */
	figma: boolean;
}

interface HarnessOptions {
	blockName: string;
	breakpoints: Breakpoint[];
	/** Authored block markup (`<div class="<name> block">…</div>`). */
	sampleContent: string;
	figmaUrl?: string;
	/** Route the outer page points its iframe at. */
	frameRoute: string;
	/** True when sampleContent is a generated placeholder (shows a hint). */
	placeholder?: boolean;
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Reduce an authored-content mock to the bare block fragment the harness can
 * inject into its own `<body>`. Agents sometimes emit a full HTML document
 * (`<html><head>…<body>…`) for `_<name>.preview.html`; nesting that inside the
 * harness body yields a broken, often blank render. Keep only the body's
 * contents and strip document scaffolding, stylesheets, inline styles, scripts
 * and comments (the harness supplies the real block CSS and decorate script).
 */
function sampleFragment(raw: string): string {
	let s = raw;
	const body = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	if (body) s = body[1];
	return s
		.replace(/<!DOCTYPE[^>]*>/gi, "")
		.replace(/<\/?(?:html|head|body)[^>]*>/gi, "")
		.replace(/<link\b[^>]*>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.trim();
}

export function buildInner(opts: HarnessOptions): string {
	const { blockName } = opts;
	const sampleContent = sampleFragment(opts.sampleContent);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/styles/styles.css" />
<link rel="stylesheet" href="/blocks/${blockName}/${blockName}.css" />
<!-- Project styles.css gates visibility on body.appear (added by scripts.js on a
     real page). The preview doesn't run scripts.js, so set it here and force the
     body visible, else the whole frame stays display:none → blank. -->
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{display:block!important}</style>
</head>
<body class="appear">
<!-- The DOM aem.js gives a block on a real page: section > wrapper > block, so
     section-level styles (.section.<name>-container) render here too. -->
<main>
<div class="section ${blockName}-container"><div class="${blockName}-wrapper">
${sampleContent}
</div></div>
</main>
<script type="module">
  // Load the block defensively: a bad import inside the block (e.g. a missing
  // scripts/*.js) must not blank the frame: fall back to the authored markup.
  (async () => {
    try {
      const mod = await import('/blocks/${blockName}/${blockName}.js');
      const block = document.querySelector('.${blockName}-wrapper > .${blockName}');
      if (block && typeof mod.default === 'function') mod.default(block);
    } catch (e) { console.error('block script failed: showing authored content only:', e); }
  })();
</script>
<script>
  // Tools that embed this frame (aem-eds-studio) size it to the block: post the
  // content height to the parent whenever it changes.
  (() => {
    if (window.parent === window) return;
    const main = document.querySelector('main');
    const post = () => window.parent.postMessage({ type: 'eds-preview-size', height: Math.ceil(main.scrollHeight) }, '*');
    if ('ResizeObserver' in window) new ResizeObserver(post).observe(main);
    addEventListener('load', post);
  })();
</script>
<script>
  // Picking, for tools that frame this page (aem-eds-studio's review): on
  // {type:'eds-pick', on} from the parent, hovering outlines an element and a
  // click posts back what it is (a selector within the block, its text, a bit
  // of its HTML). {type:'eds-pins', pins:[{n, selector}]} numbers the elements
  // already picked. Only the parent frame is listened to.
  (() => {
    if (window.parent === window) return;
    const root = () => document.querySelector('.${blockName}-wrapper > .${blockName}') || document.querySelector('main');
    const css = (id, rules) => { const s = document.createElement('style'); s.id = id; s.textContent = rules; document.head.append(s); };
    css('eds-pick-css', '.eds-pick-box{position:absolute;pointer-events:none;z-index:2147483646;outline:2px solid #ff5a36;outline-offset:-1px;background:rgba(255,90,54,.08);border-radius:2px}'
      + '.eds-pick-label{position:absolute;left:0;top:-20px;font:600 11px/18px ui-monospace,monospace;color:#0d0d0c;background:#ff5a36;padding:0 6px;border-radius:3px;white-space:nowrap}'
      + '.eds-pin{position:absolute;pointer-events:none;z-index:2147483645;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ff5a36;color:#0d0d0c;font:700 11px/20px ui-monospace,monospace;text-align:center;box-shadow:0 0 0 2px #fff}'
      + '.eds-picking, .eds-picking *{cursor:crosshair!important}');
    const box = document.createElement('div'); box.className = 'eds-pick-box'; box.hidden = true;
    const label = document.createElement('span'); label.className = 'eds-pick-label'; box.append(label);
    document.body.append(box);
    let on = false; let pins = [];
    const place = (el, node) => {
      const r = el.getBoundingClientRect();
      Object.assign(node.style, { left: (r.left + scrollX) + 'px', top: (r.top + scrollY) + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const name = (el) => el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
    // A selector from the block down: tag and classes, with :nth-of-type where siblings share them.
    const selector = (el) => {
      const top = root(); const parts = [];
      for (let n = el; n && n !== top && n !== document.body; n = n.parentElement) {
        let part = name(n);
        const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
        parts.unshift(part);
      }
      return [top && top.classList.length ? '.' + top.classList[0] : 'main', ...parts].join(' > ');
    };
    const target = (e) => { const el = e.target; return el instanceof Element && root() && root().contains(el) ? el : null; };
    const drawPins = () => {
      document.querySelectorAll('.eds-pin').forEach((p) => p.remove());
      for (const p of pins) {
        let el = null; try { el = document.querySelector(p.selector); } catch (e) { /* bad selector */ }
        if (!el) continue;
        const pin = document.createElement('span'); pin.className = 'eds-pin'; pin.textContent = String(p.n);
        const r = el.getBoundingClientRect();
        Object.assign(pin.style, { left: (r.left + scrollX - 8) + 'px', top: (r.top + scrollY - 8) + 'px' });
        document.body.append(pin);
      }
    };
    addEventListener('mousemove', (e) => {
      if (!on) return;
      const el = target(e);
      box.hidden = !el;
      if (el) { place(el, box); label.textContent = name(el); }
    });
    addEventListener('click', (e) => {
      if (!on) return;
      const el = target(e);
      e.preventDefault(); e.stopPropagation();
      if (!el) return;
      window.parent.postMessage({
        type: 'eds-picked',
        selector: selector(el),
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList],
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        html: el.outerHTML.slice(0, 600),
      }, '*');
    }, true);
    addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data) return;
      if (e.data.type === 'eds-pick') {
        on = !!e.data.on; box.hidden = true;
        document.documentElement.classList.toggle('eds-picking', on);
      }
      if (e.data.type === 'eds-pins') { pins = Array.isArray(e.data.pins) ? e.data.pins : []; drawPins(); }
    });
    addEventListener('resize', drawPins);
    if ('ResizeObserver' in window) new ResizeObserver(drawPins).observe(document.body);
  })();
</script>
<script>
  // Live reload: refresh when eds detects a change to the block.
  try { new EventSource('/__eds_events').onmessage = () => location.reload(); } catch (e) { /* no SSE */ }
</script>
</body>
</html>`;
}

export interface GalleryItem {
	blockName: string;
	breakpoints: Breakpoint[];
	frameRoute: string;
	figmaUrl?: string;
	placeholder?: boolean;
}

/** Pick the default breakpoint: widest Figma-referenced one, else widest overall. */
function defaultBreakpoint(breakpoints: Breakpoint[]): Breakpoint {
	const figmaBps = breakpoints.filter((b) => b.figma);
	return (figmaBps.length ? figmaBps : breakpoints).reduce(
		(m, b) => (b.width > m.width ? b : m),
		breakpoints[0],
	);
}

/**
 * The gallery page: one card per block, each with its own breakpoint dropdown
 * and a width-honest iframe. Re-rendered on each request by the preview server's
 * dynamic handler, so newly generated blocks appear on the next reload.
 */
export function buildGallery(items: GalleryItem[]): string {
	const cards = items
		.map((it, i) => {
			const def = defaultBreakpoint(it.breakpoints);
			const options = it.breakpoints
				.map(
					(b) =>
						`<option value="${b.width}"${b.width === def.width ? " selected" : ""}>${esc(b.label)}</option>`,
				)
				.join("");
			const figmaLink = it.figmaUrl
				? `<a class="figma-link" href="${esc(it.figmaUrl)}" target="_blank" rel="noopener">Figma ↗</a>`
				: "";
			const hint = it.placeholder ? `<span class="hint">placeholder content</span>` : "";
			return `<section class="card">
    <div class="cardbar">
      <span class="block">${esc(it.blockName)}</span>
      <select class="bp" data-i="${i}">
        ${options}
        <option value="full">Full</option>
      </select>
      ${hint}
      ${figmaLink}
    </div>
    <div class="stage">
      <div class="device" data-i="${i}" data-w="${def.width}" style="width:${def.width}px">
        <iframe src="${esc(it.frameRoute)}" title="${esc(it.blockName)} preview" loading="lazy"></iframe>
      </div>
    </div>
  </section>`;
		})
		.join("\n");

	const empty = `<p class="empty">No previewable blocks yet. Generate one with <code>eds block from-design</code>.</p>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>eds preview: gallery (${items.length})</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#1f1f1f;color:#eaeaea;font-family:ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
  .topbar{position:sticky;top:0;z-index:20;display:flex;gap:10px;align-items:center;padding:12px 18px;font-size:13px;background:#141414;border-bottom:1px solid #333}
  .topbar .title{font-weight:700}
  .topbar .count{color:#8a8a8a}
  .card{border-bottom:1px solid #2a2a2a}
  .cardbar{position:sticky;top:45px;z-index:10;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 18px;font-size:12.5px;background:#181818;border-bottom:1px solid #2a2a2a}
  .cardbar .block{font-weight:700;color:#e6e6e6}
  .hint{color:#8a8a8a}
  select.bp{appearance:none;cursor:pointer;color:#eaeaea;background:#232323;border:1px solid #3a3a3a;border-radius:8px;padding:6px 30px 6px 12px;font:inherit;font-size:12px;font-weight:600;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8a8a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;background-size:13px}
  select.bp:hover{border-color:#6a6a6a}
  .figma-link{margin-left:auto;color:#cfcfcf;text-decoration:none;font-weight:600;font-size:12px;padding:6px 11px;border:1px solid #3a3a3a;border-radius:8px;background:#232323}
  .figma-link:hover{border-color:#6a6a6a;color:#fff}
  .stage{padding:24px 18px;display:flex;justify-content:center;overflow-x:auto}
  .device{position:relative;background:#fff;border:1px solid #000;transition:width .2s ease}
  .device::before{content:attr(data-w) "px";position:absolute;top:-19px;left:0;font-size:11px;color:#8a8a8a;font-family:ui-monospace,Menlo,monospace}
  iframe{display:block;width:100%;height:560px;border:0}
  .empty{padding:60px 20px;text-align:center;color:#8a8a8a}
  .empty code{color:#bdbdbd}
</style>
</head>
<body>
  <div class="topbar"><span class="title">eds gallery</span><span class="count">${items.length} block${items.length === 1 ? "" : "s"}</span></div>
  ${items.length ? cards : empty}
  <script>
    for (const sel of document.querySelectorAll('select.bp')) {
      const device = document.querySelector('.device[data-i="'+sel.dataset.i+'"]');
      const apply = (v) => {
        if (v === 'full') { device.style.width = '100%'; device.dataset.w = Math.round(device.getBoundingClientRect().width); }
        else { device.style.width = v + 'px'; device.dataset.w = v; }
      };
      sel.addEventListener('change', () => apply(sel.value === 'full' ? 'full' : Number(sel.value)));
      apply(Number(sel.value));
    }
    // Full-page reload when eds detects a block change (new blocks appear, too).
    try { new EventSource('/__eds_events').onmessage = () => location.reload(); } catch (e) { /* no SSE */ }
  </script>
</body>
</html>`;
}

export function buildOuter(opts: HarnessOptions): string {
	const { blockName, breakpoints, figmaUrl, frameRoute, placeholder } = opts;

	// Default to the widest Figma-referenced breakpoint, else the widest overall.
	const figmaBps = breakpoints.filter((b) => b.figma);
	const def = (figmaBps.length ? figmaBps : breakpoints).reduce(
		(m, b) => (b.width > m.width ? b : m),
		breakpoints[0],
	);

	const options = breakpoints
		.map(
			(b) =>
				`<option value="${b.width}"${b.width === def.width ? " selected" : ""}>${esc(b.label)}</option>`,
		)
		.join("\n      ");

	const figmaLink = figmaUrl
		? `<a class="figma-link" href="${esc(figmaUrl)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
      Open in Figma
    </a>`
		: "";

	const hint = placeholder
		? `<span class="hint">placeholder content: add <code>blocks/${blockName}/_${blockName}.preview.html</code></span>`
		: "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>eds preview: ${esc(blockName)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#1f1f1f;color:#eaeaea;font-family:ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
  .bar{position:sticky;top:0;z-index:10;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 18px;font-size:13px;background:#141414;border-bottom:1px solid #333}
  .bar .label{color:#8a8a8a;font-weight:600}
  .bar .block{color:#e6e6e6;font-weight:700}
  select#bp{appearance:none;cursor:pointer;color:#eaeaea;background:#232323;border:1px solid #3a3a3a;border-radius:8px;padding:7px 34px 7px 13px;font:inherit;font-size:12.5px;font-weight:600;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8a8a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px}
  select#bp:hover{border-color:#6a6a6a;background-color:#2e2e2e}
  .hint{color:#8a8a8a;font-size:12px}
  .hint code{color:#bdbdbd}
  .figma-link{margin-left:auto;display:inline-flex;align-items:center;gap:7px;color:#cfcfcf;text-decoration:none;font-weight:600;font-size:12.5px;padding:7px 13px;border:1px solid #3a3a3a;border-radius:8px;background:#232323}
  .figma-link svg{width:15px;height:15px}
  .figma-link:hover{border-color:#6a6a6a;background:#2e2e2e;color:#fff}
  .stage{padding:30px 28px;display:flex;justify-content:center;overflow-x:auto}
  .device{position:relative;background:#fff;border:1px solid #000;transition:width .2s ease}
  .device::before{content:attr(data-w) "px";position:absolute;top:-20px;left:0;font-size:11px;color:#8a8a8a;font-family:ui-monospace,Menlo,monospace}
  iframe{display:block;width:100%;height:820px;border:0}
</style>
</head>
<body>
  <div class="bar">
    <span class="label">Block</span><span class="block">${esc(blockName)}</span>
    <label class="label" for="bp" style="margin-left:8px">Breakpoint</label>
    <select id="bp">
      ${options}
      <option value="full">Full cała szerokość</option>
    </select>
    ${hint}
    ${figmaLink}
  </div>
  <div class="stage">
    <div class="device" id="device" data-w="${def.width}" style="width:${def.width}px">
      <iframe id="frame" src="${frameRoute}" title="${esc(blockName)} preview"></iframe>
    </div>
  </div>
  <script>
    const device = document.getElementById('device');
    const bp = document.getElementById('bp');
    function setWidth(w){
      if(w==='full'){device.style.width='100%';device.dataset.w=Math.round(device.getBoundingClientRect().width);}
      else{device.style.width=w+'px';device.dataset.w=w;}
    }
    bp.addEventListener('change',()=>setWidth(bp.value==='full'?'full':Number(bp.value)));
    setWidth(Number(bp.value));
  </script>
</body>
</html>`;
}
