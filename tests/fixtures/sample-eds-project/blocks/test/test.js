// EDS block: test
// Generated from Figma — node 1:208 "Section - Video/Rigor Test Block"
//
// Authored content (read from the block, order-independent):
//   WATCH THE RIGOR TEST          ← heading  (title + titleType)
//   Our engineering team …        ← body     (richtext)
//   [PLAY DOCUMENTARY](video)     ← CTA link (link + linkText)  → play control
//   <picture>                     ← poster   (image + imageAlt)
//
// decorate() restructures the authored DOM into the two-column teaser; it never
// hardcodes copy. Play icons are inlined SVG (UI chrome, not authored content).

const TRIANGLE_SVG = '<svg viewBox="0 0 11 14" width="11" height="14" aria-hidden="true" focusable="false"><path d="M0 0L11 7L0 14V0Z" fill="currentColor"/></svg>';

const CIRCLE_PLAY_SVG = '<svg viewBox="0 0 50 50" width="50" height="50" fill="none" aria-hidden="true" focusable="false"><circle cx="25" cy="25" r="24" stroke="currentColor" stroke-width="1.5"/><path d="M20 15.5L35.5 25L20 34.5V15.5Z" fill="currentColor"/></svg>';

export default function decorate(block) {
  // Gather authored pieces from whatever markup EDS handed us.
  const picture = block.querySelector('picture');
  const img = block.querySelector('img');
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  const link = block.querySelector('a[href]');
  // Prose = paragraphs that aren't merely wrapping the CTA link.
  const paragraphs = [...block.querySelectorAll('p')].filter((p) => !link || !p.contains(link));

  const label = link ? (link.textContent.trim() || 'Play') : '';
  const playHref = link ? link.getAttribute('href') : null;

  const inner = document.createElement('div');
  inner.className = 'test-inner';

  // ── Text column ──────────────────────────────────────────
  const text = document.createElement('div');
  text.className = 'test-text';

  if (heading) {
    heading.classList.add('test-eyebrow');
    text.append(heading);
  }

  if (paragraphs.length) {
    const body = document.createElement('div');
    body.className = 'test-body';
    body.append(...paragraphs);
    text.append(body);
  }

  if (link) {
    const play = document.createElement('a');
    play.className = 'test-play';
    play.href = playHref;
    if (link.title) play.title = link.title;
    play.setAttribute('aria-label', label);
    play.innerHTML = `<span class="test-play-button">${TRIANGLE_SVG}</span><span class="test-play-label">${label}</span>`;
    text.append(play);
  }

  inner.append(text);

  // ── Media column ─────────────────────────────────────────
  if (picture || img) {
    const figure = document.createElement('figure');
    figure.className = 'test-figure';
    if (img) {
      // Below-fold teaser → lazy-load the poster.
      img.loading = 'lazy';
      img.decoding = 'async';
    }
    figure.append(picture || img);
    figure.insertAdjacentHTML('beforeend', `<span class="test-media-play">${CIRCLE_PLAY_SVG}</span>`);

    const media = document.createElement('div');
    media.className = 'test-media';
    if (playHref) {
      const mediaLink = document.createElement('a');
      mediaLink.className = 'test-media-link';
      mediaLink.href = playHref;
      mediaLink.setAttribute('aria-label', label || 'Play video');
      mediaLink.append(figure);
      media.append(mediaLink);
    } else {
      media.append(figure);
    }
    inner.append(media);
  }

  block.textContent = '';
  block.append(inner);
}
