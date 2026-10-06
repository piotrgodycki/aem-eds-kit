// aem-eds-kit landing - terminal animation, copy buttons, FAQ accordion.
// Vanilla JS, no dependencies. Built from DOM nodes (no innerHTML).

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Terminal animation ──────────────────────────────
  // The interactive wizard: `eds block from-design` with no URL walks you
  // through the 7 steps, then hands the prompt to your agent.
  const CMD = 'eds block from-design';
  const LINES = [
    { q: true, text: '1/7  Design source', answer: 'Figma' },
    { q: true, text: '2/7  Component name', answer: 'hero' },
    { q: true, text: '3/7  Figma link', answer: 'figma.com/design/k8Q2/Site?node-id=42-100' },
    { q: true, text: '4/7  Where does the content come from?', answer: 'Universal Editor' },
    { q: true, text: '5/7  Generate the Universal Editor model?', answer: 'yes' },
    { q: true, text: '6/7  Fetch a screenshot for a pixel-perfect check?', answer: 'yes' },
    { q: true, text: '7/7  Run with', answer: 'claude' },
    { arrow: true, text: 'Handing off to claude', note: 'via Figma MCP' },
    { figma: true, text: 'get_design_context', note: 'Figma MCP  8.4s' },
    { figma: true, text: 'get_variable_defs', note: 'Figma MCP  2.1s' },
    { figma: true, text: 'get_screenshot', note: 'Figma MCP  5.7s' },
    { write: true, text: 'blocks/hero/hero.css', note: '0.3s' },
    { write: true, text: 'blocks/hero/hero.js', note: '0.2s' },
    { write: true, text: 'blocks/hero/_hero.json', note: 'UE model · 0.1s' },
    { ok: true, text: 'agent finished', note: '43.8s · $0.08' },
    { arrow: true, text: 'Next:', note: 'eds block preview hero' },
  ];
  const CH = 32, GAP = 380, HOLD = 4500, STEP = 40;
  const END = CMD.length * CH + 500 + LINES.length * GAP + HOLD;
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderTerminal(body, t) {
    const typedN = Math.min(CMD.length, Math.floor(t / CH));
    const t0 = CMD.length * CH + 500;
    const shown = t < t0 ? 0 : Math.min(LINES.length, Math.floor((t - t0) / GAP) + 1);
    const typing = shown === 0;
    const done = shown === LINES.length;

    const frag = document.createDocumentFragment();

    const cmd = el('div', 'term-cmd');
    cmd.append(el('span', 'accent', '$ '), document.createTextNode(CMD.slice(0, typedN)));
    if (typing && !done) cmd.append(el('span', 'term-cursor'));
    frag.append(cmd);

    // The brand lockup the CLI prints first: >_ tile, wordmark, maker credit,
    // the five accent dots and the command tagline.
    if (shown > 0) {
      const lk = el('div', 'term-lockup');
      lk.append(
        el('span', 'term-mark', '>_'),
        el('span', 'term-brand', 'aem-eds-kit'),
        el('span', 'term-by', 'by Piotr Godycki'),
        el('span', 'term-dots', '● ● ● ● ●'),
        el('span', 'term-tag', 'Design → EDS block'),
      );
      frag.append(lk);
    }

    LINES.slice(0, shown).forEach((l, i) => {
      // The live-log header appears right before the first agent tool call,
      // exactly where the CLI prints it.
      if (l.figma && !LINES[i - 1]?.figma) {
        frag.append(el('div', 'term-note', 'Running Claude Code - live log:'));
      }
      const row = el('div', 'term-line');
      const check = l.ok || l.q;
      const kind = check ? 'ok' : l.figma ? 'figma' : l.write ? 'write' : l.arrow ? 'arrow' : '';
      const glyph = el('span', `term-glyph ${kind}`.trim());
      glyph.textContent = check ? '✔' : l.figma ? '◆' : l.write ? '✎' : l.arrow ? '→' : '';
      row.append(glyph);
      if (l.text) row.append(el('span', 'term-text', l.text));
      if (l.answer) row.append(el('span', 'term-answer', l.answer));
      if (l.note) row.append(el('span', 'term-note', l.note));
      frag.append(row);
    });

    // Live spinner on the current phase (mirrors the CLI's ora spinner) - only
    // while the agent is actually working, not during the wizard questions.
    const last = LINES[shown - 1];
    if (shown > 0 && !done && last && (last.figma || last.write)) {
      const row = el('div', 'term-line');
      const g = el('span', 'term-glyph ok');
      g.textContent = SPIN[Math.floor(t / 80) % SPIN.length];
      row.append(g, el('span', 'term-text', 'working'), el('span', 'term-note', `${Math.round((t - t0) / 1000)}s`));
      frag.append(row);
    }

    if (done) {
      const prompt = el('div', 'term-prompt');
      prompt.append(el('span', 'accent', '$ '), el('span', 'term-cursor term-cursor-blink'));
      frag.append(prompt);
    }

    body.replaceChildren(frag);
  }

  const body = document.querySelector('[data-term-body]');
  if (body) {
    if (reduceMotion) {
      renderTerminal(body, END - HOLD); // final state, fully rendered, static
    } else {
      let t = 0;
      let visible = true;
      const terminal = document.querySelector('[data-terminal]');
      if ('IntersectionObserver' in window && terminal) {
        new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
        }, { threshold: 0.1 }).observe(terminal);
      }
      renderTerminal(body, 0);
      setInterval(() => {
        if (!visible) return;
        t = t + STEP > END ? 0 : t + STEP;
        renderTerminal(body, t);
      }, STEP);
    }
  }

  // ── Copy buttons ────────────────────────────────────
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('.copy-label');
      navigator.clipboard?.writeText(btn.dataset.copy).catch(() => {});
      if (label) {
        label.textContent = 'copied';
        setTimeout(() => { label.textContent = 'copy'; }, 1600);
      }
    });
  });

  // ── FAQ accordion (one open at a time) ──────────────
  const faq = document.querySelector('[data-faq]');
  if (faq) {
    const items = [...faq.querySelectorAll('.faq-q')];
    items.forEach((q) => {
      q.addEventListener('click', () => {
        const isOpen = q.getAttribute('aria-expanded') === 'true';
        items.forEach((other) => {
          const open = other === q && !isOpen;
          other.setAttribute('aria-expanded', String(open));
          const sign = other.querySelector('.faq-sign');
          if (sign) sign.textContent = open ? '−' : '+';
        });
      });
    });
  }
})();
