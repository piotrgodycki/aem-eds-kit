// EDS block: apex-hero-auto
// Generated from Figma — node 1:192 "Hero Section" (file PzoHmBztZV0js5Qq6zdDnV)
//
// Expected authored content (one logical group per row, content in the first cell):
//   [background image]                        ← <picture>/<img>, becomes the bg layer
//   EST. 2026 INDUSTRIAL SERIES               ← eyebrow (first plain paragraph)
//   # REACH NEW HEIGHTS                       ← h1 heading
//   Precision engineered…                     ← body paragraph(s)
//   [EXPLORE SERIES](#) [TECHNICAL DATA](#)   ← links → CTAs (1st primary, rest outlined)
//
// decorate() reads whatever EDS hands it and tags it semantically; it never
// hardcodes copy, so authors stay in control of the text.

export default function decorate(block) {
  // Flatten the authored row/cell wrappers into a flat list of content nodes.
  const nodes = [...block.querySelectorAll(':scope > div > div > *')];
  block.textContent = '';

  // Background layer: the first authored image (if any) becomes the hero backdrop.
  const picture = nodes.find((n) => n.matches('picture, img') || n.querySelector('picture, img'));
  if (picture) {
    const bg = document.createElement('div');
    bg.className = 'apex-hero-auto-bg';
    bg.append(picture.matches('picture, img') ? picture : picture.querySelector('picture, img'));
    // Above-the-fold hero → load eagerly with high priority.
    const img = bg.querySelector('img');
    if (img) {
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      img.removeAttribute('data-loading');
    }
    block.append(bg);
  }

  // Content column holds everything the reader sees over the backdrop.
  const content = document.createElement('div');
  content.className = 'apex-hero-auto-content';

  // Heading → tag the authored h1/h2/h3.
  const heading = nodes.find((n) => n.matches('h1, h2, h3'));
  if (heading) {
    heading.classList.add('apex-hero-auto-heading');
    content.append(heading);
  }

  // Paragraphs: link-only paragraphs become CTAs; the first prose line is the
  // eyebrow, the rest is body copy.
  const paragraphs = nodes.filter((n) => n.matches('p'));
  const links = [];
  const prose = [];
  paragraphs.forEach((p) => {
    const link = p.querySelector('a');
    if (link && link.textContent.trim() === p.textContent.trim()) {
      links.push(link);
    } else if (p.textContent.trim()) {
      prose.push(p);
    }
  });

  const [eyebrow, ...body] = prose;
  if (eyebrow) {
    eyebrow.classList.add('apex-hero-auto-eyebrow');
    // Eyebrow sits above the heading in the design.
    content.prepend(eyebrow);
  }
  body.forEach((p) => {
    p.classList.add('apex-hero-auto-body');
    content.append(p);
  });

  // CTAs collected into a single actions row; first = primary, rest = outlined.
  if (links.length) {
    const actions = document.createElement('div');
    actions.className = 'apex-hero-auto-actions';
    links.forEach((link, i) => {
      link.classList.add('apex-hero-auto-cta', i === 0 ? 'apex-hero-auto-cta-primary' : 'apex-hero-auto-cta-secondary');
      actions.append(link);
    });
    content.append(actions);
  }

  block.append(content);
}
