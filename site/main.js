// aem-eds-kit landing - terminal animation, step cards, copy buttons,
// FAQ accordion.
// Vanilla JS, no dependencies. Built from DOM nodes (no innerHTML).

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Terminal animation ──────────────────────────────
  // A frame-accurate replay of `eds block from-design` with no URL, built from
  // the CLI's own output (src/lib/ui.ts, commands/block/from-design.ts,
  // lib/agents/invoke.ts): the EDS logo + lockup, the 7-step inquirer wizard,
  // the summary, the ora spinners, Claude Code's live log and the verification.
  // The script is a list of steps; each renders its live state while running
  // and its final lines once done, so any moment t is a pure function.

  // A line is a list of [class, text] segments; '' = default text colour.
  const L = (...segs) => segs;
  const BLANK = L();
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const spin = (t) => SPIN[Math.floor(t / 80) % SPIN.length];
  const CURSOR = ['cursor', ' '];

  const ART = [
    '█████ ████  █████',
    '█     █   █ █    ',
    '████  █   █ █████',
    '█     █   █     █',
    '█████ ████  █████',
  ];

  const step = {
    // `$ eds block from-design`, typed.
    type: (cmd) => ({
      dur: cmd.length * 45 + 450,
      live: (t) => [L(['acc', '$ '], ['', cmd.slice(0, Math.floor(t / 45))], CURSOR)],
      done: [L(['acc', '$ '], ['', cmd])],
    }),
    // Plain lines that print at once (logger.info / headings).
    print: (lines, dur = 140) => ({ dur, live: () => lines, done: lines }),
    // ui.logo(): gradient block art, then the lockup line.
    logo: (tagline) => {
      const lines = [
        BLANK,
        ...ART.map((row) => L(['art', `  ${row}`])),
        BLANK,
        L(['', '  '], ['mark', ' >_ '], ['b', ' aem-eds-kit'], ['', '   '], ['dots', '● ● ● ● ●'], ['dim', '  ' + tagline]),
        BLANK,
      ];
      return { dur: 650, live: () => lines, done: lines };
    },
    // inquirer select: the list with the brand `❯`, then the answered line.
    select: (msg, choices, pick, dur = 1300) => ({
      dur,
      live: (t) => {
        const at = Math.min(pick, Math.floor((t / dur) * (pick + 2)));
        return [
          L(['b', msg]),
          ...choices.map((c, i) => (i === at ? L(['accb', `❯ ${c}`]) : L(['', `  ${c}`]))),
          L(['dim', '↑↓ navigate • ⏎ select']),
        ];
      },
      done: [L(['b', msg], ['', ' '], ['cyan', choices[pick]])],
    }),
    // inquirer input: typed answer, then the answered line.
    input: (msg, value, perChar = 45) => ({
      dur: value.length * perChar + 500,
      live: (t) => [L(['b', msg], ['', ' '], ['', value.slice(0, Math.floor(t / perChar))], CURSOR)],
      done: [L(['b', msg], ['', ' '], ['cyan', value])],
    }),
    // inquirer confirm.
    confirm: (msg, yes, def = '(Y/n)') => ({
      dur: 800,
      live: () => [L(['b', msg], ['dim', ` ${def}`], ['', ' '], CURSOR)],
      done: [L(['b', msg], ['', ' '], ['cyan', yes ? 'Yes' : 'No'])],
    }),
    // ora spinner → spinner.succeed (green ✔).
    spinner: (text, done, dur = 700, color = 'cyan') => ({
      dur,
      live: (t) => [L([color, spin(t)], ['', ` ${text}`])],
      done: [L(['ok', '✔'], ['', ' '], ...done)],
    }),
    // renderClaudeStream: lines scroll above a yellow spinner with the current
    // activity + elapsed time, then `✔ agent finished`.
    agent: (events, dur, result) => ({
      dur,
      live: (t) => {
        const shown = events.filter((e) => e.at <= t);
        const activity = shown.length ? shown[shown.length - 1].next : 'thinking';
        return [
          ...shown.map((e) => L(['', '   '], ...e.line)),
          L(['warn', spin(t)], ['', ` ${activity}  `], ['dim', `${Math.round((t / dur) * 21)}s`]),
        ];
      },
      done: [
        ...events.map((e) => L(['', '   '], ...e.line)),
        L(['ok', '✔'], ['', ' '], ['acc', 'agent finished'], ['dim', `  ${result}`]),
      ],
    }),
  };

  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const heading = (title) => [BLANK, L(['red', '▊'], ['', ' '], ['b', title]), BLANK];
  const accentLine = (name, value, w) => L(['', '  '], ['acc', '✔'], ['', ` ${pad(name, w)}  `], ['dim', value]);
  const statusLine = (name, value, w) => L(['', '  '], ['pass', '✓'], ['', ` ${pad(name, w)}  `], ['dim', value]);

  const SW = 'screenshot'.length;
  const VW = 'Universal Editor model'.length;
  const SCRIPT = [
    step.type('eds block from-design'),
    step.logo('Design → EDS block'),
    step.select('1/7  Design source', ['Figma', 'Google Stitch', 'Canva', 'Sketch', 'Framer'], 0, 1000),
    step.input('2/7  Component name', 'hero', 90),
    step.input('3/7  Figma link', 'https://www.figma.com/design/k8Q2xLm/Site?node-id=42-100', 18),
    step.select('4/7  Where does the content come from?', [
      'Document authoring (default EDS)',
      'Universal Editor',
      'Content Fragment',
      'Mixed - Universal Editor + Content Fragment',
    ], 1),
    step.confirm('5/7  Generate the Universal Editor model?', true),
    step.confirm('6/7  Add a screenshot MCP call for a pixel check? (off = one fewer MCP call)', false, '(y/N)'),
    step.select('7/7  Run with', [
      'claude',
      'Preview the prompt only (--dry-run)',
      'Save the prompt, run it later (--agent none)',
    ], 0, 1000),
    step.print(heading('Summary'), 200),
    step.print([
      accentLine('component', 'hero', SW),
      accentLine('figma', 'node 42:100', SW),
      accentLine('content', 'ue', SW),
      accentLine('ue model', 'yes', SW),
      accentLine('screenshot', 'no (token-lean)', SW),
      accentLine('run', 'claude', SW),
      BLANK,
    ], 500),
    step.confirm('Generate this block?', true),
    step.spinner('Parsing Figma URL...', [['', 'Parsed Figma URL  '], ['dim', 'node 42:100']], 450),
    step.spinner('Resolving design source...', [['', 'Design source  '], ['dim', 'MCP (1 call, cached)']], 800),
    step.spinner('Reading design tokens & building prompt...', [['', 'Loaded design tokens  '], ['dim', 'styles/styles.css']], 700),
    step.print([L(['dim', '  prompt → ~/my-eds-site/tmp/eds-cli/from-design-1760371200000.md'])], 120),
    step.spinner('Detecting AI agent...', [['', 'Agent ready  '], ['cyan', 'claude'], ['dim', '  /usr/local/bin/claude']], 550),
    step.print([
      L(['', '  '], ['dim', '→'], ['', ' Handing off to '], ['cyan', 'claude'], ['dim', '  via Figma MCP (1 call, cached)']),
      L(['dim', '     get_design_context ×1 → cache']),
      L(['', 'Running Claude Code '], ['dim', '- live log:']),
    ], 350),
    step.agent([
      { at: 1500, next: 'Read', line: [['figma', '◆'], ['', ' '], ['b', 'get_design_context'], ['dim', '  Figma MCP  4.1s']] },
      { at: 1900, next: 'Write', line: [['dim', '· read styles/styles.css  0.1s']] },
      { at: 2600, next: 'Write', line: [['acc', '✎'], ['', ' '], ['cyan', 'blocks/hero/hero.js'], ['dim', '  0.2s']] },
      { at: 3100, next: 'Write', line: [['acc', '✎'], ['', ' '], ['cyan', 'blocks/hero/hero.css'], ['dim', '  0.3s']] },
      { at: 3600, next: 'thinking', line: [['acc', '✎'], ['', ' '], ['cyan', 'blocks/hero/_hero.json'], ['dim', '  0.1s']] },
      { at: 4300, next: 'thinking', line: [['dim', 'Created hero: hero.js, hero.css, _hero.json (UE model).']] },
    ], 4900, '21.2s · $0.084'),
    step.print(heading('Verification'), 200),
    step.print([
      statusLine('hero.js', 'created', VW),
      statusLine('hero.css', 'created', VW),
      statusLine('decorate export', 'found', VW),
      statusLine('scoped CSS', 'scoped to .hero', VW),
      statusLine('Universal Editor model', '_hero.json created', VW),
    ], 600),
    step.print([L(['pass', '✓'], ['', ' Block "hero" generation complete.'])], 300),
    step.confirm('Instrument this block for analytics (dataLayer)?', false, '(y/N)'),
    step.print([BLANK], 80),
  ];
  // The run ends parked on the post-generation menu.
  const FINAL = [
    L(['b', 'Block ready — what next?']),
    L(['accb', '❯ Refine — describe a change']),
    L(['', '  Open live preview']),
    L(['', '  Finish']),
    L(['dim', '↑↓ navigate • ⏎ select']),
  ];
  const HOLD = 5000, TICK = 40;
  const RUN = SCRIPT.reduce((sum, s) => sum + s.dur, 0);
  const END = RUN + HOLD;

  function linesAt(t) {
    const out = [];
    let start = 0;
    for (const s of SCRIPT) {
      if (t < start + s.dur) {
        out.push(...s.live(t - start));
        return out;
      }
      out.push(...s.done);
      start += s.dur;
    }
    out.push(...FINAL);
    return out;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderTerminal(body, t) {
    const frag = document.createDocumentFragment();
    for (const line of linesAt(t)) {
      const row = el('div', 'tl');
      if (!line.length) row.append(document.createTextNode(' '));
      for (const [cls, text] of line) {
        row.append(cls ? el('span', `t-${cls}`, text) : document.createTextNode(text));
      }
      frag.append(row);
    }
    body.replaceChildren(frag);
    // Like a real terminal: keep the newest output in view.
    body.scrollTop = body.scrollHeight;
  }

  const body = document.querySelector('[data-term-body]');
  if (body) {
    if (reduceMotion) {
      renderTerminal(body, RUN); // final state, fully rendered, static
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
        t = t + TICK > END ? 0 : t + TICK;
        renderTerminal(body, t);
      }, TICK);
    }
  }

  // ── Typewriter headline ─────────────────────────────
  // "EDS block out" types itself in key by key and ends on the terminal's
  // blinking block cursor. Screen readers get the whole text at once; with
  // reduced motion it shows complete, cursor still.
  const tw = document.querySelector('[data-typewriter]');
  if (tw) {
    const text = tw.textContent;
    const ghost = el('span', 'tw-ghost', text);
    ghost.append(el('span', 'tw-caret'));
    ghost.setAttribute('aria-hidden', 'true');
    const typed = el('span', 'tw-typed');
    typed.setAttribute('aria-hidden', 'true');
    const out = document.createTextNode(reduceMotion ? text : '');
    const caret = el('span', reduceMotion ? 'tw-caret' : 'tw-caret is-typing');
    typed.append(out, caret);
    tw.replaceChildren(el('span', 'sr-only', text), ghost, typed);
    if (!reduceMotion) {
      let i = 0;
      const next = () => {
        out.data = text.slice(0, ++i);
        if (i < text.length) {
          // Uneven, human-ish key rhythm; a beat longer after a space.
          setTimeout(next, (text[i - 1] === ' ' ? 170 : 75) + Math.random() * 70);
        } else {
          caret.classList.remove('is-typing');
        }
      };
      setTimeout(next, 650);
    }
  }

  // ── How it works: the picked step card lifts ────────
  const liftCards = [...document.querySelectorAll('[data-lift]')];
  liftCards.forEach((card) => {
    card.addEventListener('click', () => {
      liftCards.forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
    });
  });

  // ── Copy buttons ────────────────────────────────────
  // `data-copy` copies the literal attribute; `data-copy-from` copies the text
  // of a referenced element (for long multi-line snippets like the agent prompt).
  document.querySelectorAll('[data-copy], [data-copy-from]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('.copy-label');
      const fromSel = btn.dataset.copyFrom;
      const text = fromSel ? (document.querySelector(fromSel)?.textContent ?? '') : btn.dataset.copy;
      navigator.clipboard?.writeText(text).catch(() => {});
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
