// EDS block: test2
// Generated from Figma — node 1:226 "Section - Conversion Block"
//
// Authored content (read from the block, order-independent):
//   READY FOR THE UPGRADE?        ← heading  (title + titleType, default h2)
//   Join thousands of …           ← body     (richtext)
//   [ORDER APEX-X1](#)            ← CTA 1 → filled "primary" button
//   [FIND A RETAILER](#)          ← CTA 2 → outlined "secondary" button
//
// decorate() restructures the authored DOM into a centered conversion block; it
// never hardcodes copy. First link = primary, any remaining links = secondary.
export default function decorate(block) {
  const inner = document.createElement('div');
  inner.className = 'test2-inner';

  // Heading — tag is whatever titleType produced (h1–h6).
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.classList.add('test2-heading');
    inner.append(heading);
  }

  // CTA links are gathered first so body prose can exclude their wrappers.
  const links = [...block.querySelectorAll('a[href]')];

  // Body = paragraphs that aren't merely wrapping a CTA link.
  [...block.querySelectorAll('p')]
    .filter((p) => !links.some((a) => p.contains(a)))
    .forEach((p) => {
      p.classList.add('test2-body');
      inner.append(p);
    });

  if (links.length) {
    const actions = document.createElement('div');
    actions.className = 'test2-actions';
    links.forEach((link, i) => {
      link.classList.add('test2-cta', i === 0 ? 'test2-cta-primary' : 'test2-cta-secondary');
      actions.append(link);
    });
    inner.append(actions);
  }

  block.textContent = '';
  block.append(inner);
}
