// Shared by every page: the mobile menu, the desktop mega menu and the search
// overlay (⌘K / Ctrl+K or /). Without JS the plain nav links still work.
// Analytics events go through window.edsTrack (site/analytics.js).
(() => {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const toggle = nav.querySelector(".nav-toggle");
  const links = nav.querySelector(".nav-links");
  // dataLayer events (site/analytics.js); a no-op if it isn't on the page.
  const track = (event, params) => window.edsTrack?.(event, params);
  const onHome = /(^|\/)(index\.html)?$/.test(location.pathname);
  const home = (hash) => (onHome ? hash : `index.html${hash}`);

  // ── Mobile menu (below 720px the links fold into a toggle) ──
  const setOpen = (open) => {
    nav.classList.toggle("nav-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle?.addEventListener("click", () => setOpen(!nav.classList.contains("nav-open")));
  links?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  matchMedia("(width > 720px)").addEventListener("change", (e) => e.matches && setOpen(false));

  // ── Mega menu (desktop) ──
  const MENU = [
    {
      label: "Product",
      cols: [
        {
          title: "aem-eds-kit",
          items: [
            [home("#how"), "How it works", "Design link in, EDS block out"],
            [home("#commands"), "Commands", "Every command at a glance"],
            [home("#studio"), "Desktop app", "AEM EDS Studio for macOS and Windows"],
            [home("#audits"), "Audits", "Loading, security, accessibility, visuals"],
            [home("#roadmap"), "Roadmap", "Next, then, later"],
            [home("#faq"), "FAQ", "Tokens, MCP, local models, cost"],
          ],
        },
      ],
      card: ["docs.html#install", "Try it in 30 seconds", "npx aem-eds-kit block from-design --sample"],
    },
    {
      label: "Docs",
      cols: [
        {
          title: "Start",
          items: [
            ["docs.html#install", "Install", "Node 20+, npm, pnpm or yarn"],
            ["docs.html#end-to-end", "From zero to a page", "Pick your authoring model"],
            ["docs.html#new", "eds new", "Clone the boilerplate"],
            ["docs.html#init", "eds init", "Configure a project"],
          ],
        },
        {
          title: "Blocks",
          items: [
            ["docs.html#from-design", "block from-design", "Figma, Framer, Stitch, any page"],
            ["docs.html#draft", "draft", "Review rounds, then accept"],
            ["docs.html#preview", "block preview", "Breakpoints, live reload"],
            ["docs.html#block-test", "block test", "Visual regression"],
          ],
        },
        {
          title: "Universal Editor & AEM",
          items: [
            ["docs.html#ue", "ue check | open", "Readiness and deep link"],
            ["docs.html#model", "model add", "UE models from blocks"],
            ["docs.html#migrate", "migrate component", "AEM dialogs to EDS"],
            ["docs.html#scaffold-ue", "scaffold ue", "Crosswalk setup"],
          ],
        },
        {
          title: "Quality",
          items: [
            ["docs.html#doctor", "doctor", "Project health"],
            ["docs.html#audit-loading", "audit loading", "Lighthouse-style loading"],
            ["docs.html#audit-security", "audit security", "Secrets and headers"],
            ["docs.html#scaffold-ci", "scaffold ci", "GitHub Actions"],
          ],
        },
      ],
      all: ["docs.html", "All docs"],
    },
    {
      label: "Guides",
      cols: [
        {
          title: "Guides",
          items: [
            ["aem-to-eds-migration.html", "AEM to EDS migration", "Components and content, step by step"],
            ["document-authoring-vs-universal-editor.html", "Document Authoring vs UE", "Which authoring model fits"],
            ["local-development.html", "Local development", "Proxy, xwalk and the UE loop"],
            ["secure-github-sandboxes.html", "Secure GitHub sandboxes", "Disposable repos, scoped tokens"],
            ["e2e-example.html", "End-to-end example", "Real designs, real blocks"],
          ],
        },
      ],
    },
    { label: "Changelog", href: "changelog.html" },
  ];

  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (html) n.innerHTML = html;
    return n;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const bar = el("div", { class: "mega-bar", role: "list" });
  let openPanel = null;
  let hoverTimer;
  const closeMega = () => {
    if (!openPanel) return;
    openPanel.trigger.setAttribute("aria-expanded", "false");
    openPanel.panel.hidden = true;
    openPanel = null;
  };
  const openMega = (entry) => {
    if (openPanel?.panel === entry.panel) return;
    closeMega();
    entry.trigger.setAttribute("aria-expanded", "true");
    entry.panel.hidden = false;
    openPanel = entry;
    track("mega_menu_open", { menu: entry.label });
  };

  MENU.forEach((m, i) => {
    const item = el("div", { class: "mega-item", role: "listitem" });
    if (m.href) {
      item.append(el("a", { href: m.href, class: "mega-trigger" }, esc(m.label)));
      bar.append(item);
      return;
    }
    const id = `mega-${i}`;
    const trigger = el(
      "button",
      { type: "button", class: "mega-trigger", "aria-expanded": "false", "aria-controls": id },
      `${esc(m.label)}<svg class="mega-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    );
    const cols = m.cols
      .map(
        (c) =>
          `<div class="mega-col"><p class="mega-title">${esc(c.title)}</p>${c.items
            .map(([href, t, d]) => `<a href="${href}" class="mega-link"><span class="mega-link-t">${esc(t)}</span><span class="mega-link-d">${esc(d)}</span></a>`)
            .join("")}</div>`,
      )
      .join("");
    const card = m.card
      ? `<a href="${m.card[0]}" class="mega-card"><span class="mega-title">${esc(m.card[1])}</span><code>${esc(m.card[2])}</code><span class="mega-more">Install guide →</span></a>`
      : "";
    const all = m.all ? `<a href="${m.all[0]}" class="mega-all">${esc(m.all[1])} →</a>` : "";
    const panel = el("div", { class: `mega-panel mega-cols-${m.cols.length}${m.card ? " has-card" : ""}`, id, hidden: "" }, `<div class="mega-grid">${cols}${card}</div>${all}`);
    const entry = { trigger, panel, label: m.label };
    trigger.addEventListener("click", () => (openPanel?.panel === panel ? closeMega() : openMega(entry)));
    item.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => openMega(entry), 80);
    });
    item.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(closeMega, 160);
    });
    panel.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      track("mega_menu_click", {
        menu: m.label,
        link_text: (a.querySelector(".mega-link-t, .mega-title") || a).textContent.trim(),
        link_url: a.href,
      });
      closeMega();
    });
    item.append(trigger, panel);
    bar.append(item);
  });
  links?.after(bar);
  nav.classList.add("has-mega");
  document.addEventListener("click", (e) => openPanel && !e.target.closest(".mega-item") && closeMega());

  // ── Search overlay ──
  const kbd = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  const searchBtn = el(
    "button",
    { type: "button", class: "search-btn", "aria-label": "Search the site", "aria-haspopup": "dialog" },
    `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span class="search-btn-label">Search</span><kbd>${kbd}</kbd>`,
  );
  (nav.querySelector(".nav-actions") ?? toggle)?.before(searchBtn);

  const overlay = el(
    "div",
    { class: "search-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Search", hidden: "" },
    `<div class="search-box">
      <div class="search-field">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input type="search" placeholder="Search commands, guides, changelog…" aria-label="Search the site" autocomplete="off" spellcheck="false">
        <button type="button" class="search-close" aria-label="Close search"><kbd>Esc</kbd></button>
      </div>
      <ul class="search-results" role="listbox" aria-label="Results"></ul>
      <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
    </div>`,
  );
  document.body.append(overlay);
  const input = overlay.querySelector("input");
  const list = overlay.querySelector(".search-results");
  let index = null;
  let results = [];
  let active = 0;
  let lastFocus = null;

  const loadIndex = () =>
    index
      ? Promise.resolve(index)
      : new Promise((resolve) => {
          if (window.EDS_SEARCH) return resolve((index = window.EDS_SEARCH));
          const s = el("script", { src: "search-index.js" });
          s.onload = () => resolve((index = window.EDS_SEARCH || []));
          s.onerror = () => resolve((index = []));
          document.head.append(s);
        });

  const SUGGEST = ["block from-design", "draft", "install", "migrate", "audit", "universal editor"];
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const mark = (s, words) => {
    let out = esc(s);
    for (const w of words) if (w.length > 1) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    return out;
  };
  const search = (q) => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index
      .map((e) => {
        const t = norm(e.t);
        const x = norm(e.x);
        const p = norm(e.pt);
        let score = 0;
        for (const w of words) {
          if (t.includes(w)) score += t.startsWith(w) ? 12 : 8;
          else if (p.includes(w)) score += 3;
          else if (x.includes(w)) score += 2;
          else return null;
        }
        if (t === norm(q)) score += 20;
        if (e.p === "changelog.html") score -= 4; // docs and guides first
        return { e, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.e);
  };

  const render = () => {
    const q = input.value.trim();
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!q) {
      list.innerHTML = `<li class="search-empty"><span class="mega-title">Try</span>${SUGGEST.map((s) => `<button type="button" class="search-chip">${esc(s)}</button>`).join("")}</li>`;
      results = [];
      return;
    }
    results = search(q);
    if (!results.length) {
      list.innerHTML = `<li class="search-empty">No results for “${esc(q)}”.</li>`;
      return;
    }
    active = Math.min(active, results.length - 1);
    list.innerHTML = results
      .map(
        (r, i) =>
          `<li role="option" id="sr-${i}" aria-selected="${i === active}"><a href="${r.u}" class="search-hit${i === active ? " is-active" : ""}"><span class="search-page">${esc(r.pt)}</span><span class="search-title">${mark(r.t, words)}</span>${r.x ? `<span class="search-text">${mark(r.x.slice(0, 140), words)}</span>` : ""}</a></li>`,
      )
      .join("");
    input.setAttribute("aria-activedescendant", `sr-${active}`);
  };
  const move = (d) => {
    if (!results.length) return;
    active = (active + d + results.length) % results.length;
    render();
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  };

  let searchTimer;
  const reportSearch = () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length >= 2) searchTimer = setTimeout(() => track("search", { search_term: q, results: results.length }), 900);
  };
  const reportHit = (r, i) =>
    track("search_result_click", { search_term: input.value.trim(), link_url: r.u, position: i + 1 });
  const openSearch = async (method = "button") => {
    track("search_open", { method });
    closeMega();
    setOpen(false);
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add("search-open");
    input.value = "";
    active = 0;
    await loadIndex();
    render();
    input.focus();
  };
  const closeSearch = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.documentElement.classList.remove("search-open");
    lastFocus?.focus?.();
  };

  searchBtn.addEventListener("click", () => openSearch("button"));
  overlay.querySelector(".search-close").addEventListener("click", closeSearch);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSearch();
    const chip = e.target.closest(".search-chip");
    if (chip) {
      input.value = chip.textContent;
      active = 0;
      render();
      reportSearch();
      input.focus();
    }
    const hit = e.target.closest(".search-hit");
    if (hit) {
      const i = [...list.querySelectorAll(".search-hit")].indexOf(hit);
      if (results[i]) reportHit(results[i], i);
      closeSearch();
    }
  });
  input.addEventListener("input", () => {
    active = 0;
    render();
    reportSearch();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      const href = results[active].u;
      reportHit(results[active], active);
      closeSearch();
      location.href = href;
    }
  });
  // Keep Tab inside the dialog.
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...overlay.querySelectorAll("input, button, a[href]")];
    const first = f[0];
    const last = f.at(-1);
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      overlay.hidden ? openSearch("shortcut") : closeSearch();
    } else if (e.key === "/" && !typing && overlay.hidden) {
      e.preventDefault();
      openSearch("slash");
    } else if (e.key === "Escape") {
      if (!overlay.hidden) closeSearch();
      else if (openPanel) {
        const t = openPanel.trigger;
        closeMega();
        t.focus();
      } else if (nav.classList.contains("nav-open")) {
        setOpen(false);
        toggle?.focus();
      }
    }
  });
})();
