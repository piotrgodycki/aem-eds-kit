// EDS block: apex-hero
// Generated from Figma — node 1:192 "Hero Section"
//
// Expected authored content (one cell), top-to-bottom:
//   EST. 2026 INDUSTRIAL SERIES        ← eyebrow (plain paragraph)
//   # REACH NEW HEIGHTS                ← h1 heading
//   Precision engineered…              ← body paragraph(s)
//   [EXPLORE SERIES](#) [TECHNICAL DATA](#)  ← links → CTAs
//
// decorate() reads whatever EDS hands it and tags it semantically; it does not
// hardcode copy, so authors stay in control of the text.

export default function decorate(block) {
  // Flatten the authored row/cell wrappers into a single content container.
  const content = document.createElement('div');
  content.className = 'apex-hero-content';
  content.append(...block.querySelectorAll(':scope > div > div > *'));
  block.textContent = '';
  block.append(content);

  // Heading → h1.
  const heading = content.querySelector('h1, h2, h3');
  if (heading) heading.classList.add('apex-hero-heading');

  // Paragraphs: the first one is the eyebrow, any remaining prose is body copy.
  // Paragraphs that only hold links become the actions row instead.
  const paragraphs = [...content.querySelectorAll('p')];
  const prose = paragraphs.filter((p) => !p.querySelector('a') || p.textContent.trim() !== p.querySelector('a').textContent.trim());
  const firstProse = prose[0];
  if (firstProse) firstProse.classList.add('apex-hero-eyebrow');
  prose.slice(1).forEach((p) => p.classList.add('apex-hero-body'));

  // Collect every CTA link into one actions row; first = primary, rest = outlined.
  const links = [...content.querySelectorAll('a')];
  if (links.length) {
    const actions = document.createElement('div');
    actions.className = 'apex-hero-actions';
    links.forEach((link, i) => {
      link.classList.add(i === 0 ? 'apex-hero-cta-primary' : 'apex-hero-cta-secondary');
      // Drop now-empty wrapping paragraphs so they don't add stray gaps.
      const wrapper = link.closest('p');
      actions.append(link);
      if (wrapper && !wrapper.textContent.trim()) wrapper.remove();
    });
    content.append(actions);
  }
}
