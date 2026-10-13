// aem-eds-kit example file - Figma plugin that builds the branded test file
// for `eds block from-design`, following docs/figma-design-guidelines.md:
//
//   • Variables  - color/*, spacing/*, radius/*, font-size/* (one collection)
//   • Text styles - Display, Heading 2, Heading 3, Body Large, Body, Small, …
//   • Components - one top-level kebab-case frame per EDS block, Auto Layout
//                  everywhere, layers named by role, tokens bound (no raw hex),
//                  variants as lowercase properties (Layout=split, Theme=dark)
//   • Pages      - Cover, Tokens, Components, Blocks, Home (instances)
//
// The HTML twin lives in site/example/ (same tokens, copy, layer = class names).
// Re-running is safe: it reuses the variables/styles and replaces only what it
// created before. Plain ES2017 on purpose (Figma's plugin sandbox).

const KEY = 'aem-eds-kit';
const IMG_BASE = 'https://piotrgodycki.github.io/aem-eds-kit/example/img/';
const W = 1440;
const GUTTER = 120;

// ── Tokens (keep in sync with site/example/example.css :root) ─────────────
const COLORS = {
  'color/brand': '#ff5a36',
  'color/on-brand': '#0d0d0c',
  'color/background': '#f6f5f1',
  'color/surface': '#ffffff',
  'color/text': '#0d0d0c',
  'color/text-muted': '#5c5a54',
  'color/line': '#dcdad3',
  'color/dark-background': '#0d0d0c',
  'color/dark-surface': '#161614',
  'color/dark-text': '#ecebe6',
  'color/dark-text-muted': '#9a9890',
  'color/dark-line': '#2a2a27',
};
const NUMBERS = {
  'spacing/xs': 4, 'spacing/s': 8, 'spacing/m': 16, 'spacing/l': 24,
  'spacing/xl': 40, 'spacing/xxl': 64, 'spacing/section': 96, 'spacing/gutter': 120,
  'radius/s': 6, 'radius/m': 12, 'radius/l': 20, 'radius/pill': 999,
  'font-size/display': 72, 'font-size/heading-2': 44, 'font-size/heading-3': 22,
  'font-size/body-large': 19, 'font-size/body': 16, 'font-size/small': 14, 'font-size/label': 13,
};
const SCOPES = {
  spacing: ['GAP', 'WIDTH_HEIGHT'],
  radius: ['CORNER_RADIUS'],
  'font-size': ['FONT_SIZE'],
};

// Text styles: [name, family, weight, size, line-height %, letter-spacing %, size variable]
const TEXT_STYLES = [
  ['Display', 'sans', 'SemiBold', 72, 100, -4.5, 'font-size/display'],
  ['Heading 2', 'sans', 'SemiBold', 44, 105, -3.5, 'font-size/heading-2'],
  ['Heading 3', 'sans', 'SemiBold', 22, 125, -2, 'font-size/heading-3'],
  ['Heading 4', 'sans', 'SemiBold', 18, 135, -1, null],
  ['Body Large', 'sans', 'Regular', 19, 155, 0, 'font-size/body-large'],
  ['Body', 'sans', 'Regular', 16, 155, 0, 'font-size/body'],
  ['Small', 'sans', 'Regular', 14, 150, 0, 'font-size/small'],
  ['Label', 'mono', 'Medium', 13, 140, 0, 'font-size/label'],
  ['Button', 'sans', 'SemiBold', 15, 120, 0, null],
  ['Stat', 'sans', 'SemiBold', 40, 110, -3.5, null],
  ['Quote', 'sans', 'Medium', 34, 125, -2.5, null],
  ['Logo', 'mono', 'Medium', 17, 120, -3, null],
  ['Logo Mark', 'mono', 'Bold', 14, 100, -6, null],
  ['Code', 'mono', 'Regular', 14, 170, 0, null],
];

// ── Fonts (Geist from Google Fonts; Inter / Roboto Mono if unavailable) ──
const FONTS = {
  sans: { family: 'Geist', fallback: 'Inter', styles: { Regular: 'Regular', Medium: 'Medium', SemiBold: 'Semi Bold', Bold: 'Bold' } },
  mono: { family: 'Geist Mono', fallback: 'Roboto Mono', styles: { Regular: 'Regular', Medium: 'Medium', SemiBold: 'SemiBold', Bold: 'Bold' } },
};
const resolvedFont = {};

async function loadFonts() {
  for (const kind of Object.keys(FONTS)) {
    const f = FONTS[kind];
    for (const weight of Object.keys(f.styles)) {
      const primary = { family: f.family, style: weight };
      try {
        await figma.loadFontAsync(primary);
        resolvedFont[kind + weight] = primary;
      } catch (e) {
        const alt = { family: f.fallback, style: f.styles[weight] };
        try {
          await figma.loadFontAsync(alt);
          resolvedFont[kind + weight] = alt;
        } catch (e2) {
          const last = { family: 'Inter', style: 'Regular' };
          await figma.loadFontAsync(last);
          resolvedFont[kind + weight] = last;
        }
      }
    }
  }
}

// ── Variables ─────────────────────────────────────────────────────────────
const V = {};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

async function setupVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = collections.filter((c) => c.name === KEY)[0];
  if (!collection) {
    collection = figma.variables.createVariableCollection(KEY);
    collection.renameMode(collection.modes[0].modeId, 'light');
  }
  const modeId = collection.modes[0].modeId;
  const existing = {};
  (await figma.variables.getLocalVariablesAsync()).forEach((v) => {
    if (v.variableCollectionId === collection.id) existing[v.name] = v;
  });
  const make = (name, type, value) => {
    const v = existing[name] || figma.variables.createVariable(name, collection, type);
    v.setValueForMode(modeId, value);
    V[name] = v;
    return v;
  };
  Object.keys(COLORS).forEach((name) => {
    const v = make(name, 'COLOR', hexToRgb(COLORS[name]));
    v.scopes = ['ALL_FILLS', 'STROKE_COLOR'];
  });
  Object.keys(NUMBERS).forEach((name) => {
    const v = make(name, 'FLOAT', NUMBERS[name]);
    const scopes = SCOPES[name.split('/')[0]];
    if (scopes) v.scopes = scopes;
    v.setVariableCodeSyntax('WEB', 'var(--' + name.replace('/', '-') + ')');
  });
  Object.keys(COLORS).forEach((name) => {
    V[name].setVariableCodeSyntax('WEB', 'var(--' + name.replace('/', '-') + ')');
  });
}

// ── Text styles ───────────────────────────────────────────────────────────
const S = {};

async function setupTextStyles() {
  const existing = {};
  (await figma.getLocalTextStylesAsync()).forEach((s) => { existing[s.name] = s; });
  for (const [name, kind, weight, size, lh, ls, sizeVar] of TEXT_STYLES) {
    const style = existing[name] || figma.createTextStyle();
    style.name = name;
    style.fontName = resolvedFont[kind + weight];
    style.fontSize = size;
    style.lineHeight = { unit: 'PERCENT', value: lh };
    style.letterSpacing = { unit: 'PERCENT', value: ls };
    if (sizeVar) {
      try { style.setBoundVariable('fontSize', V[sizeVar]); } catch (e) { /* older API */ }
    }
    S[name] = style;
  }
}

// ── Node helpers ──────────────────────────────────────────────────────────
function paint(token) {
  const p = { type: 'SOLID', color: hexToRgb(COLORS[token]) };
  return figma.variables.setBoundVariableForPaint(p, 'color', V[token]);
}

// Set a numeric property from a token ('spacing/l') or a raw number.
function num(node, field, value) {
  if (typeof value === 'string') {
    node[field] = NUMBERS[value];
    node.setBoundVariable(field, V[value]);
  } else {
    node[field] = value;
  }
}

const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX', between: 'SPACE_BETWEEN', baseline: 'BASELINE' };

// Turn a frame/component into an Auto Layout container.
// o: dir row|col, gap, pad [t, r, b, l] | token, fill, stroke, strokeSides,
//    radius, align, cross, wrap, clip
function layout(node, o) {
  node.layoutMode = o.dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  node.primaryAxisSizingMode = 'AUTO';
  node.counterAxisSizingMode = 'AUTO';
  if (o.gap !== undefined) num(node, 'itemSpacing', o.gap);
  if (o.pad !== undefined) {
    const p = Array.isArray(o.pad) ? o.pad : [o.pad, o.pad, o.pad, o.pad];
    num(node, 'paddingTop', p[0]);
    num(node, 'paddingRight', p[1]);
    num(node, 'paddingBottom', p[2]);
    num(node, 'paddingLeft', p[3]);
  }
  if (o.align) node.primaryAxisAlignItems = ALIGN[o.align];
  if (o.cross) node.counterAxisAlignItems = ALIGN[o.cross];
  if (o.wrap) node.layoutWrap = 'WRAP';
  node.fills = o.fill ? [paint(o.fill)] : [];
  if (o.stroke) {
    node.strokes = [paint(o.stroke)];
    node.strokeAlign = 'INSIDE';
    if (o.strokeSides) {
      node.strokeTopWeight = o.strokeSides.indexOf('top') > -1 ? 1 : 0;
      node.strokeRightWeight = o.strokeSides.indexOf('right') > -1 ? 1 : 0;
      node.strokeBottomWeight = o.strokeSides.indexOf('bottom') > -1 ? 1 : 0;
      node.strokeLeftWeight = o.strokeSides.indexOf('left') > -1 ? 1 : 0;
    } else {
      node.strokeWeight = 1;
    }
  }
  if (o.radius !== undefined) {
    ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach((f) => num(node, f, o.radius));
  }
  node.clipsContent = !!o.clip;
  return node;
}

function frame(name, o) {
  const f = figma.createFrame();
  f.name = name;
  return layout(f, o || {});
}

// Append and size a child: w/h = 'fill' | 'hug' | number (fixed).
function add(parent, child, w, h) {
  parent.appendChild(child);
  const size = (axis, v) => {
    const field = axis === 'w' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
    if (v === 'fill') child[field] = 'FILL';
    else if (v === 'hug') {
      // HUG only exists for text and Auto Layout frames; shapes keep their size.
      if (child.type === 'TEXT' || (child.layoutMode && child.layoutMode !== 'NONE')) child[field] = 'HUG';
    }
    else if (typeof v === 'number') {
      child[field] = 'FIXED';
      if (axis === 'w') child.resize(v, child.height);
      else child.resize(child.width, v);
    }
  };
  size('w', w);
  size('h', h);
  return child;
}

async function text(name, chars, styleName, color, o) {
  o = o || {};
  const t = figma.createText();
  t.name = name;
  const st = S[styleName];
  t.fontName = st.fontName;
  t.characters = chars;
  await t.setTextStyleIdAsync(st.id);
  t.fills = [paint(color)];
  if (o.align) t.textAlignHorizontal = o.align;
  return t;
}

// Text that fills its parent's width and wraps.
async function para(parent, name, chars, styleName, color, o) {
  const t = await text(name, chars, styleName, color, o);
  add(parent, t, 'fill', 'hug');
  t.textAutoResize = 'HEIGHT';
  return t;
}

const imageCache = {};
async function imageFill(file) {
  if (!imageCache[file]) {
    try {
      const img = await figma.createImageAsync(IMG_BASE + file);
      imageCache[file] = { type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' };
    } catch (e) {
      imageCache[file] = null; // offline / not deployed yet: keep the placeholder
    }
  }
  return imageCache[file];
}

// Image layer: a rectangle with an image fill, named by role (alt hint).
async function image(name, file, w, h, radius) {
  const r = figma.createRectangle();
  r.name = name;
  r.resize(w, h);
  const fill = await imageFill(file);
  r.fills = fill ? [fill] : [paint('color/line')];
  if (radius) ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach((f) => num(r, f, radius));
  return r;
}

function dot(name, token, size) {
  const e = figma.createEllipse();
  e.name = name;
  e.resize(size, size);
  e.fills = [paint(token)];
  return e;
}

// ── Theme helper: light / dark text tokens ───────────────────────────────
function theme(dark) {
  return dark
    ? { bg: 'color/dark-background', text: 'color/dark-text', muted: 'color/dark-text-muted', line: 'color/dark-line', surface: 'color/dark-surface' }
    : { bg: 'color/background', text: 'color/text', muted: 'color/text-muted', line: 'color/line', surface: 'color/surface' };
}

// Block root: a component, 1440 wide, height hugs content.
function blockRoot(name, o) {
  const c = figma.createComponent();
  c.name = name;
  layout(c, Object.assign({ pad: ['spacing/section', 'spacing/gutter', 'spacing/section', 'spacing/gutter'] }, o));
  c.resize(W, 100);
  c.layoutSizingHorizontal = 'FIXED';
  c.layoutSizingVertical = 'HUG';
  return c;
}

// ── Shared components: logo, button ───────────────────────────────────────
const C = {};

async function buildLogo(dark) {
  const t = theme(dark);
  const logo = figma.createComponent();
  logo.name = 'Theme=' + (dark ? 'dark' : 'light');
  layout(logo, { dir: 'row', gap: 10, cross: 'center' });
  const m = frame('logo-mark', { dir: 'row', align: 'center', cross: 'center', fill: 'color/brand', radius: 8 });
  add(logo, m, 32, 32);
  add(m, await text('logo-glyph', '>_', 'Logo Mark', 'color/on-brand'), 'hug', 'hug');
  add(logo, await text('logo-wordmark', 'aem-eds-kit', 'Logo', t.text), 'hug', 'hug');
  return logo;
}

async function buildButton(style) {
  const b = figma.createComponent();
  b.name = 'Style=' + style;
  const cfg = {
    primary: { fill: 'color/brand', text: 'color/on-brand', label: 'Get started', font: 'Button' },
    secondary: { stroke: 'color/text', text: 'color/text', label: 'Read the docs', font: 'Button' },
    'secondary-dark': { stroke: 'color/dark-text', text: 'color/dark-text', label: 'Read the docs', font: 'Button' },
    dark: { fill: 'color/dark-background', text: 'color/dark-text', label: '$ npm i -g aem-eds-kit', font: 'Code' },
  }[style];
  layout(b, { dir: 'row', gap: 'spacing/s', pad: [0, 'spacing/l', 0, 'spacing/l'], align: 'center', cross: 'center', fill: cfg.fill, stroke: cfg.stroke, radius: 'radius/m' });
  b.resize(100, 48);
  b.layoutSizingVertical = 'FIXED';
  b.layoutSizingHorizontal = 'HUG';
  add(b, await text('label', cfg.label, cfg.font, cfg.text), 'hug', 'hug');
  return b;
}

// Instance of a variant set with overridden label text.
async function button(style, label) {
  const comp = C.button.children.filter((c) => c.name === 'Style=' + style)[0];
  const inst = comp.createInstance();
  inst.name = 'button-' + style.replace('-dark', '');
  const key = Object.keys(inst.componentProperties).filter((k) => k.indexOf('label') === 0)[0];
  inst.setProperties({ [key]: label });
  return inst;
}

function logoInstance(dark) {
  const comp = C.logo.children.filter((c) => c.name === 'Theme=' + (dark ? 'dark' : 'light'))[0];
  const inst = comp.createInstance();
  inst.name = 'logo';
  return inst;
}

// ── Blocks ────────────────────────────────────────────────────────────────

async function buildHeader() {
  const c = blockRoot('header', { dir: 'row', gap: 'spacing/xl', pad: [20, 'spacing/gutter', 20, 'spacing/gutter'], cross: 'center', fill: 'color/background', stroke: 'color/line', strokeSides: ['bottom'] });
  add(c, logoInstance(false), 'hug', 'hug');
  const nav = frame('nav', { dir: 'row', gap: 32, cross: 'center' });
  add(c, nav, 'fill', 'hug');
  for (const label of ['How it works', 'Blocks', 'Docs', 'Changelog']) {
    add(nav, await text('nav-link', label, 'Body', 'color/text-muted'), 'hug', 'hug');
  }
  const actions = frame('header-actions', { dir: 'row', gap: 'spacing/m', cross: 'center' });
  add(c, actions, 'hug', 'hug');
  add(actions, await button('secondary', 'GitHub'), 'hug', 'hug');
  add(actions, await button('primary', 'Get started'), 'hug', 'hug');
  c.description = 'Site header: logo, nav (4 links), actions (GitHub, Get started). Maps to the EDS header fragment.';
  return c;
}

async function heroVariant(layoutName, dark) {
  const t = theme(dark);
  const split = layoutName === 'split';
  const c = blockRoot('Layout=' + layoutName + ', Theme=' + (dark ? 'dark' : 'light'), {
    dir: split ? 'row' : 'col', gap: 'spacing/xxl', cross: 'center', fill: t.bg,
  });
  const content = frame('content', { dir: 'col', gap: 'spacing/l', cross: split ? 'start' : 'center' });
  add(c, content, split ? 'fill' : 'fill', 'hug');
  const align = split ? 'LEFT' : 'CENTER';
  add(content, await text('eyebrow', 'CLI for AEM Edge Delivery Services', 'Label', 'color/brand'), 'hug', 'hug');
  await para(content, 'headline', 'Design frame in. EDS block out.', 'Display', t.text, { align });
  const desc = await para(content, 'description', 'Paste a design link - Figma, Stitch, Canva, Sketch or Framer. Your AI agent reads it through MCP and writes the block - JS, CSS and a Universal Editor model - then checks it against the screenshot.', 'Body Large', t.muted, { align });
  if (!split) { desc.layoutSizingHorizontal = 'FIXED'; desc.resize(720, desc.height); }
  const ctas = frame('cta-group', { dir: 'row', gap: 12 });
  add(content, ctas, 'hug', 'hug');
  add(ctas, await button('primary', 'Install the CLI'), 'hug', 'hug');
  add(ctas, await button(dark ? 'secondary-dark' : 'secondary', 'Read the docs'), 'hug', 'hug');
  if (split) add(c, await image('hero-image', 'hero-stack.png', 560, 517, 'radius/l'), 'hug', 'hug');
  return c;
}

async function buildHero(page) {
  const variants = [
    await heroVariant('split', true),
    await heroVariant('split', false),
    await heroVariant('centered', false),
    await heroVariant('centered', true),
  ];
  const set = figma.combineAsVariants(variants, page);
  set.name = 'hero';
  set.description = 'Hero block. Variants map to classes: Layout=split|centered → .hero.split / .hero.centered, Theme=dark|light → .hero.dark. Fields: eyebrow (text), headline (text), description (richtext), cta-group (2 links), hero-image (reference, split only).';
  return set;
}

async function buildStats() {
  const c = blockRoot('stats', { dir: 'row', gap: 'spacing/l', pad: ['spacing/xxl', 'spacing/gutter', 'spacing/xxl', 'spacing/gutter'], fill: 'color/surface', stroke: 'color/line', strokeSides: ['bottom'] });
  const items = [
    ['0 bytes', 'shipped to your site bundle'],
    ['~73 kB', 'published package'],
    ['17', 'Universal Editor field types mapped'],
    ['3 agents', 'Claude Code · Cursor · Codex'],
  ];
  for (const [value, label] of items) {
    const stat = frame('stat', { dir: 'col', gap: 'spacing/xs' });
    add(c, stat, 'fill', 'hug');
    await para(stat, 'stat-value', value, 'Stat', 'color/text');
    await para(stat, 'stat-label', label, 'Small', 'color/text-muted');
  }
  c.description = 'Stats row: 4 × stat (stat-value, stat-label). UE: multifield of { value: text, label: text }.';
  return c;
}

async function sectionHeader(parent, eyebrow, headline, description, t, width) {
  const h = frame('section-header', { dir: 'col', gap: 'spacing/m' });
  if (width) { add(parent, h, width, 'hug'); } else { add(parent, h, 720, 'hug'); }
  add(h, await text('eyebrow', eyebrow, 'Label', 'color/brand'), 'hug', 'hug');
  await para(h, 'headline', headline, 'Heading 2', t.text);
  if (description) await para(h, 'description', description, 'Body Large', t.muted);
  return h;
}

async function buildCard() {
  const card = figma.createComponent();
  card.name = 'card';
  layout(card, { dir: 'col', fill: 'color/surface', stroke: 'color/line', radius: 'radius/m', clip: true });
  card.resize(384, 100);
  card.layoutSizingHorizontal = 'FIXED';
  card.layoutSizingVertical = 'HUG';
  const img = await image('card-image', 'card-design.png', 384, 288);
  add(card, img, 'fill', 288);
  const body = frame('card-body', { dir: 'col', gap: 12, pad: 'spacing/l' });
  add(card, body, 'fill', 'hug');
  const title = await para(body, 'card-title', 'Blocks from a design link', 'Heading 3', 'color/text');
  const desc = await para(body, 'card-description', 'Paste a Figma, Stitch, Canva, Sketch or Framer link. Your agent writes the JS, CSS and model.', 'Body', 'color/text-muted');
  const link = await text('card-link', 'How it works →', 'Button', 'color/brand');
  add(body, link, 'hug', 'hug');
  title.componentPropertyReferences = { characters: card.addComponentProperty('title', 'TEXT', title.characters) };
  desc.componentPropertyReferences = { characters: card.addComponentProperty('description', 'TEXT', desc.characters) };
  link.componentPropertyReferences = {
    characters: card.addComponentProperty('link', 'TEXT', link.characters),
    visible: card.addComponentProperty('Show link', 'BOOLEAN', true),
  };
  img.componentPropertyReferences = { visible: card.addComponentProperty('Has image', 'BOOLEAN', true) };
  card.description = 'Card: card-image (reference), card-title (text), card-description (richtext), card-link (aem-content link). Booleans: Has image, Show link.';
  return card;
}

async function buildCards() {
  const t = theme(false);
  const c = blockRoot('cards', { dir: 'col', gap: 'spacing/xl', fill: 'color/background' });
  await sectionHeader(c, 'What it does', 'One CLI around the whole block workflow.', 'Fetch the design once, generate the block with its Universal Editor model, then check it before review.', t);
  const list = frame('card-list', { dir: 'row', gap: 'spacing/l' });
  add(c, list, 'fill', 'hug');
  const cards = [
    ['card-design.png', 'Blocks from a design link', 'Paste a Figma, Stitch, Canva, Sketch or Framer link. Your agent writes the JS, CSS and model.', 'How it works →'],
    ['card-model.png', 'Universal Editor models', 'Text, image and variant layers mapped to UE fields - 17 field types, multifields included.', 'Field reference →'],
    ['card-audit.png', 'Checks before review', 'Doctor, loading and security audits - locally or in CI. Security exits non-zero on critical and high findings.', 'Audits →'],
  ];
  for (const [file, title, description, link] of cards) {
    const inst = C.card.createInstance();
    add(list, inst, 'fill', 'hug');
    const props = {};
    Object.keys(inst.componentProperties).forEach((k) => {
      const base = k.split('#')[0];
      if (base === 'title') props[k] = title;
      if (base === 'description') props[k] = description;
      if (base === 'link') props[k] = link;
    });
    inst.setProperties(props);
    const img = inst.findOne((n) => n.name === 'card-image');
    const fill = await imageFill(file);
    if (img && fill) img.fills = [fill];
  }
  c.description = 'Cards block: section-header + card-list of 3 card instances. UE: multifield of card.';
  return c;
}

async function buildColumns() {
  const t = theme(false);
  const c = blockRoot('columns', { dir: 'row', gap: 'spacing/xxl', cross: 'center', fill: 'color/surface' });
  const col = frame('column-text', { dir: 'col', gap: 'spacing/l' });
  add(c, col, 'fill', 'hug');
  add(col, await text('eyebrow', 'With @adobe/aem-cli', 'Label', 'color/brand'), 'hug', 'hug');
  await para(col, 'headline', 'Keep your dev server. Add the workflow.', 'Heading 2', t.text);
  await para(col, 'description', 'aem up still serves your site. eds adds what\'s around it: scaffolding, blocks from design, Universal Editor models, audits and preview.', 'Body Large', t.muted);
  const list = frame('feature-list', { dir: 'col', gap: 12 });
  add(col, list, 'fill', 'hug');
  for (const item of ['Runs from anywhere inside an EDS project', 'Zero bytes shipped to your site bundle', 'Works with Claude Code, Cursor and Codex']) {
    const row = frame('feature-item', { dir: 'row', gap: 12, cross: 'center' });
    add(list, row, 'fill', 'hug');
    add(row, dot('decorative-bullet', 'color/brand', 8), 'hug', 'hug');
    await para(row, 'feature-text', item, 'Body', t.text);
  }
  add(c, await image('column-image', 'columns-terminal.png', 560, 414, 'radius/l'), 'hug', 'hug');
  c.description = 'Columns: column-text (eyebrow, headline, description, feature-list) + column-image. Maps to the EDS columns block (2 cells).';
  return c;
}

async function teaserVariant(side) {
  const t = theme(true);
  const c = blockRoot('Layout=' + side, { dir: 'row', gap: 'spacing/xxl', cross: 'center', fill: 'color/dark-background' });
  const img = await image('teaser-image', 'teaser-mark.png', 480, 384, 'radius/l');
  const content = frame('teaser-content', { dir: 'col', gap: 'spacing/l' });
  if (side === 'image-left') add(c, img, 'hug', 'hug');
  add(c, content, 'fill', 'hug');
  if (side === 'image-right') add(c, img, 'hug', 'hug');
  add(content, await text('eyebrow', 'Migration', 'Label', 'color/brand'), 'hug', 'hug');
  await para(content, 'headline', 'Moving from AEM Sites?', 'Heading 2', t.text);
  await para(content, 'description', 'Map components to EDS blocks and content models step by step with the migration guide.', 'Body Large', t.muted);
  add(content, await button('primary', 'Read the migration guide'), 'hug', 'hug');
  return c;
}

async function buildTeaser(page) {
  const set = figma.combineAsVariants([await teaserVariant('image-left'), await teaserVariant('image-right')], page);
  set.name = 'teaser';
  set.description = 'Teaser (dark). Layout=image-left|image-right → .teaser.image-left / .image-right. Fields: teaser-image (reference), eyebrow, headline, description, cta.';
  return set;
}

async function buildTabs() {
  const t = theme(false);
  const c = blockRoot('tabs', { dir: 'col', gap: 'spacing/xl', fill: 'color/background' });
  await sectionHeader(c, 'Content sources', 'Author it the way your team works.', null, t);
  const list = frame('tab-list', { dir: 'row', gap: 'spacing/s' });
  add(c, list, 'hug', 'hug');
  const tabs = ['Document authoring', 'Universal Editor', 'Content Fragments'];
  for (let i = 0; i < tabs.length; i++) {
    const active = i === 1;
    const tab = frame(active ? 'tab-active' : 'tab', { dir: 'row', pad: [10, 18, 10, 18], radius: 'radius/pill', fill: active ? 'color/text' : 'color/surface', stroke: active ? undefined : 'color/line' });
    add(list, tab, 'hug', 'hug');
    add(tab, await text('tab-label', tabs[i], 'Body', active ? 'color/background' : 'color/text-muted'), 'hug', 'hug');
  }
  const panel = frame('tab-panel', { dir: 'row', gap: 'spacing/xl', pad: 'spacing/xl', fill: 'color/surface', stroke: 'color/line', radius: 'radius/m' });
  add(c, panel, 'fill', 'hug');
  const pt = frame('panel-text', { dir: 'col', gap: 12 });
  add(panel, pt, 'fill', 'hug');
  await para(pt, 'panel-title', 'Universal Editor', 'Heading 3', t.text);
  await para(pt, 'panel-description', 'eds writes _hero.json next to the block, so authors edit the headline, description and image in place.', 'Body', t.muted);
  const code = frame('panel-code', { dir: 'col', pad: 'spacing/l', fill: 'color/dark-background', radius: 'radius/m' });
  add(panel, code, 'fill', 'hug');
  await para(code, 'code', '$ eds block from-design <url>\n✔ content     ue\n✔ ue model    yes', 'Code', 'color/dark-text');
  c.description = 'Tabs: tab-list (3 tabs, tab-active = selected) + tab-panel (panel-text, panel-code). UE: multifield of { label, title, description, code }.';
  return c;
}

async function buildAccordion() {
  const t = theme(false);
  const c = blockRoot('accordion', { dir: 'row', gap: 'spacing/xxl', fill: 'color/surface' });
  await sectionHeader(c, 'FAQ', 'Questions, answered.', null, t, 380);
  const list = frame('accordion-list', { dir: 'col', stroke: 'color/line', strokeSides: ['top'] });
  add(c, list, 'fill', 'hug');
  const items = [
    ['Does it add anything to my site?', 'No. It\'s a dev tool only - zero bytes in your bundle, zero LCP impact.'],
    ['Do I need a Figma API token?', null],
    ['Which agents work?', null],
    ['Can I run it in CI?', null],
  ];
  for (const [q, a] of items) {
    const item = frame(a ? 'accordion-item-open' : 'accordion-item', { dir: 'col', gap: 'spacing/s', pad: [20, 0, 20, 0], stroke: 'color/line', strokeSides: ['bottom'] });
    add(list, item, 'fill', 'hug');
    const row = frame('accordion-question', { dir: 'row', gap: 'spacing/m', cross: 'center' });
    add(item, row, 'fill', 'hug');
    await para(row, 'question', q, 'Heading 4', t.text);
    add(row, await text('decorative-icon', a ? '−' : '+', 'Label', 'color/brand'), 'hug', 'hug');
    if (a) await para(item, 'accordion-answer', a, 'Body', t.muted);
  }
  c.description = 'Accordion (FAQ): section-header + accordion-list of items (question, answer). First item open. UE: multifield of { question: text, answer: richtext }.';
  return c;
}

async function buildQuote() {
  const c = blockRoot('quote', { dir: 'col', gap: 'spacing/l', cross: 'center', fill: 'color/background' });
  add(c, await text('decorative-quote-mark', '“', 'Stat', 'color/brand'), 'hug', 'hug');
  const q = await text('quote-text', 'Everything you name and structure in Figma directly influences the generated code.', 'Quote', 'color/text', { align: 'CENTER' });
  add(c, q, 880, 'hug');
  q.textAutoResize = 'HEIGHT';
  const author = frame('quote-author', { dir: 'col', gap: 2, cross: 'center' });
  add(c, author, 'hug', 'hug');
  add(author, await text('author-name', 'AI-First Design Rules', 'Heading 3', 'color/text'), 'hug', 'hug');
  add(author, await text('author-role', 'aem-eds-kit docs', 'Small', 'color/text-muted'), 'hug', 'hug');
  c.description = 'Quote: quote-text (text), author-name, author-role. The quote mark is decorative.';
  return c;
}

async function ctaVariant(themeName) {
  const brand = themeName === 'brand';
  const c = blockRoot('Theme=' + themeName, { dir: 'col', pad: [0, 'spacing/gutter', 'spacing/section', 'spacing/gutter'], fill: 'color/background' });
  const banner = frame('cta-banner', { dir: 'row', gap: 'spacing/xl', pad: 'spacing/xxl', align: 'between', cross: 'center', radius: 'radius/l', fill: brand ? 'color/brand' : 'color/dark-background' });
  add(c, banner, 'fill', 'hug');
  const content = frame('cta-content', { dir: 'col', gap: 12 });
  add(banner, content, 620, 'hug');
  const ink = brand ? 'color/on-brand' : 'color/dark-text';
  await para(content, 'headline', 'Stop rebuilding Figma by hand.', 'Heading 2', ink);
  await para(content, 'description', 'Install the CLI and generate your first block in three commands.', 'Body Large', ink);
  add(banner, await button(brand ? 'dark' : 'primary', '$ npm i -g aem-eds-kit'), 'hug', 'hug');
  return c;
}

async function buildCta(page) {
  const set = figma.combineAsVariants([await ctaVariant('brand'), await ctaVariant('dark')], page);
  set.name = 'cta-banner';
  set.description = 'CTA banner. Theme=brand|dark → .cta-banner.brand / .dark. Fields: headline, description, cta.';
  return set;
}

async function buildFooter() {
  const c = blockRoot('footer', { dir: 'col', gap: 'spacing/xxl', pad: ['spacing/xxl', 'spacing/gutter', 'spacing/xl', 'spacing/gutter'], fill: 'color/dark-background' });
  const top = frame('footer-top', { dir: 'row', gap: 'spacing/xxl' });
  add(c, top, 'fill', 'hug');
  const brand = frame('footer-brand', { dir: 'col', gap: 'spacing/m' });
  add(top, brand, 'fill', 'hug');
  add(brand, logoInstance(true), 'hug', 'hug');
  add(brand, await text('footer-tagline', 'CLI for AEM Edge Delivery Services.', 'Small', 'color/dark-text-muted'), 'hug', 'hug');
  const columns = [
    ['Product', ['How it works', 'Commands', 'Audits', 'Roadmap']],
    ['Docs', ['Local development', 'Universal Editor fields', 'Migration guide', 'Figma guidelines']],
    ['Community', ['GitHub', 'npm', 'Issues']],
  ];
  for (const [heading, links] of columns) {
    const col = frame('footer-column', { dir: 'col', gap: 12 });
    add(top, col, 200, 'hug');
    add(col, await text('footer-heading', heading, 'Label', 'color/dark-text'), 'hug', 'hug');
    for (const l of links) add(col, await text('footer-link', l, 'Small', 'color/dark-text-muted'), 'hug', 'hug');
  }
  const bottom = frame('footer-bottom', { dir: 'row', align: 'between', pad: ['spacing/l', 0, 0, 0], stroke: 'color/dark-line', strokeSides: ['top'] });
  add(c, bottom, 'fill', 'hug');
  add(bottom, await text('legal', 'aem-eds-kit · MIT · by Piotr Godycki', 'Small', 'color/dark-text-muted'), 'hug', 'hug');
  add(bottom, await text('legal', 'Example page for Figma ↔ EDS tests', 'Small', 'color/dark-text-muted'), 'hug', 'hug');
  c.description = 'Footer fragment: footer-brand (logo, tagline), 3 × footer-column (heading + links), footer-bottom (legal).';
  return c;
}

// ── Pages ─────────────────────────────────────────────────────────────────
async function getPage(name) {
  let page = figma.root.children.filter((p) => p.name === name)[0];
  if (!page) {
    page = figma.createPage();
    page.name = name;
  } else {
    await page.loadAsync();
    page.children.filter((n) => n.getPluginData(KEY) === '1').forEach((n) => n.remove());
  }
  return page;
}

function own(node) {
  node.setPluginData(KEY, '1');
  return node;
}

// Stack top-level nodes on a page with a fixed vertical gap.
function stack(nodes, x, gap) {
  let y = 0;
  nodes.forEach((n) => {
    n.x = x;
    n.y = y;
    y += n.height + gap;
  });
}

async function buildCover(page) {
  const cover = own(frame('cover', { dir: 'col', gap: 'spacing/l', pad: 120, fill: 'color/dark-background' }));
  page.appendChild(cover);
  cover.resize(1600, 960);
  cover.layoutSizingHorizontal = 'FIXED';
  cover.layoutSizingVertical = 'FIXED';
  cover.primaryAxisAlignItems = 'CENTER';
  add(cover, logoInstance(true), 'hug', 'hug');
  await para(cover, 'headline', 'Example file for Figma ↔ EDS tests', 'Display', 'color/dark-text');
  await para(cover, 'description', 'Every top-level frame on the Blocks page is one EDS block. Copy a frame link and run:\neds block from-design "<frame link>"\nCompare the result with the HTML twin: piotrgodycki.github.io/aem-eds-kit/example/', 'Body Large', 'color/dark-text-muted');
}

async function buildTokens(page) {
  const board = own(frame('tokens', { dir: 'col', gap: 'spacing/xl', pad: 'spacing/xxl', fill: 'color/background' }));
  page.appendChild(board);
  add(board, await text('headline', 'Tokens', 'Heading 2', 'color/text'), 'hug', 'hug');
  const swatches = frame('colors', { dir: 'row', gap: 'spacing/m', wrap: true });
  add(board, swatches, 1200, 'hug');
  for (const name of Object.keys(COLORS)) {
    const s = frame('swatch', { dir: 'col', gap: 'spacing/s' });
    add(swatches, s, 180, 'hug');
    const chip = frame('swatch-color', { fill: name, stroke: 'color/line', radius: 'radius/m' });
    add(s, chip, 180, 96);
    add(s, await text('swatch-name', name, 'Label', 'color/text'), 'hug', 'hug');
    add(s, await text('swatch-value', COLORS[name], 'Small', 'color/text-muted'), 'hug', 'hug');
  }
  const type = frame('type', { dir: 'col', gap: 'spacing/m' });
  add(board, type, 1200, 'hug');
  for (const st of TEXT_STYLES) {
    await para(type, 'type-' + st[0].toLowerCase().replace(/ /g, '-'), st[0] + ' · ' + st[3] + 'px', st[0], 'color/text');
  }
}

async function main() {
  figma.notify('Building the aem-eds-kit example file…', { timeout: 2000 });
  await loadFonts();
  await setupVariables();
  await setupTextStyles();

  const cover = await getPage('Cover');
  const tokens = await getPage('Tokens');
  const components = await getPage('Components');
  const blocks = await getPage('Blocks');
  const home = await getPage('Home');

  // Shared components first - the cover and every block use them.
  C.logo = own(figma.combineAsVariants([await buildLogo(false), await buildLogo(true)], components));
  C.logo.name = 'logo';
  layout(C.logo, { dir: 'row', gap: 40, pad: 40, fill: 'color/line', radius: 'radius/m' });
  C.button = own(figma.combineAsVariants(
    [await buildButton('primary'), await buildButton('secondary'), await buildButton('secondary-dark'), await buildButton('dark')],
    components,
  ));
  C.button.name = 'button';
  // Variant sets own their component properties: one `label` for all styles.
  const labelKey = C.button.addComponentProperty('label', 'TEXT', 'Get started');
  C.button.children.forEach((v) => {
    v.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: labelKey };
  });
  layout(C.button, { dir: 'row', gap: 24, pad: 40, fill: 'color/line', radius: 'radius/m' });
  C.card = own(await buildCard());
  components.appendChild(C.card);
  stack([C.logo, C.button, C.card], 0, 120);

  await buildCover(cover);
  await buildTokens(tokens);

  // Blocks: one top-level frame per EDS block
  const built = [];
  const push = (n) => { blocks.appendChild(own(n)); built.push(n); return n; };
  const header = push(await buildHeader());
  const hero = push(await buildHero(blocks));
  const stats = push(await buildStats());
  const cards = push(await buildCards());
  const columns = push(await buildColumns());
  const teaser = push(await buildTeaser(blocks));
  const tabs = push(await buildTabs());
  const accordion = push(await buildAccordion());
  const quote = push(await buildQuote());
  const cta = push(await buildCta(blocks));
  const footer = push(await buildFooter());
  [hero, teaser, cta].forEach((set) => layout(set, { dir: 'col', gap: 80, pad: 80, stroke: 'color/line', radius: 'radius/l' }));
  stack(built, 0, 160);

  // Home: the page assembled from block instances (matches site/example/)
  const homeFrame = own(frame('home-desktop', { dir: 'col', fill: 'color/background' }));
  home.appendChild(homeFrame);
  homeFrame.resize(W, 100);
  homeFrame.layoutSizingHorizontal = 'FIXED';
  homeFrame.layoutSizingVertical = 'HUG';
  const variant = (set, name) => set.children.filter((c) => c.name === name)[0];
  const parts = [
    header,
    variant(hero, 'Layout=split, Theme=dark'),
    stats, cards, columns,
    variant(teaser, 'Layout=image-left'),
    tabs, accordion, quote,
    variant(cta, 'Theme=brand'),
    footer,
  ];
  parts.forEach((comp) => {
    const inst = comp.createInstance();
    inst.name = comp.parent && comp.parent.type === 'COMPONENT_SET' ? comp.parent.name : comp.name;
    add(homeFrame, inst, 'fill', 'hug');
  });

  await figma.setCurrentPageAsync(home);
  figma.viewport.scrollAndZoomIntoView([homeFrame]);
  const missing = Object.keys(imageCache).filter((k) => !imageCache[k]);
  figma.closePlugin(missing.length
    ? 'Done - images could not be loaded (' + missing.join(', ') + '), placeholders used.'
    : 'Done - aem-eds-kit example file built.');
}

main().catch((err) => {
  figma.closePlugin('aem-eds-kit example: ' + (err && err.message ? err.message : String(err)));
});
