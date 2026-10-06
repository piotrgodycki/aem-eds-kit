/**
 * Generates the in-memory HTML for `eds block preview`.
 *
 * Two documents are produced:
 *  - `inner` — renders ONLY the block (authored content + its CSS + decorate).
 *    Loaded inside an <iframe> whose width is the chosen breakpoint, so the
 *    block's media queries fire against that width, not the real monitor.
 *  - `outer` — neutral grayscale chrome: a breakpoint dropdown and an optional
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

export interface HarnessOptions {
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

export function buildInner(opts: HarnessOptions): string {
	const { blockName, sampleContent } = opts;
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/blocks/${blockName}/${blockName}.css" />
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}</style>
</head>
<body>
${sampleContent}
<script type="module">
  import decorate from '/blocks/${blockName}/${blockName}.js';
  const block = document.querySelector('.${blockName}');
  if (block) { try { decorate(block); } catch (e) { console.error('decorate() failed:', e); } }
</script>
<script>
  // Live reload: refresh when eds detects a change to the block.
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
		? `<span class="hint">placeholder content — add <code>blocks/${blockName}/_${blockName}.preview.html</code></span>`
		: "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>eds preview — ${esc(blockName)}</title>
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
