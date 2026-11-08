// dataLayer events for the business-relevant actions on the site (GTM / GA4
// ready). Nothing is sent anywhere until a tag manager is added; the events
// are documented in docs/site-analytics.md. Add ?debug_datalayer to a URL to
// log every event to the console.
(() => {
  const dl = (window.dataLayer = window.dataLayer || []);
  const debug = /[?&]debug_datalayer\b/.test(location.search);
  const page = location.pathname.split("/").pop() || "index.html";

  const track = (event, params = {}) => {
    const entry = { event, page, ...params };
    dl.push(entry);
    if (debug) console.info("[dataLayer]", entry);
  };
  // nav.js (search, mega menu) reports through this.
  window.edsTrack = track;

  const where = (el) => {
    if (el.closest(".mega-panel")) return "mega_menu";
    if (el.closest(".search-overlay")) return "search";
    if (el.closest(".nav")) return "nav";
    if (el.closest("footer")) return "footer";
    if (el.closest(".hero")) return "hero";
    return el.closest("section[id], [id]")?.id || "page";
  };
  const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);

  // ── Clicks ──
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest("a, button");
      if (!el) return;
      const location = where(el);

      // Copy buttons: the install command and the agent prompt.
      if (el.matches("[data-copy], [data-copy-from]")) {
        const command = el.dataset.copy || (el.dataset.copyFrom === "#agent-prompt" ? "agent_setup_prompt" : el.dataset.copyFrom);
        return track("copy_command", { command, location });
      }
      if (el.tagName !== "A") return;

      if (location === "mega_menu") return; // nav.js reports mega_menu_click
      const href = el.getAttribute("href") || "";
      const url = el.href;
      let cta = null;
      let extra = {};
      if (/github\.com\/piotrgodycki\/aem-eds-studio\/releases/.test(url)) {
        if (!e.isTrusted) return; // a script, not a person
        cta = "studio_download";
        extra = { platform: el.dataset.dl || (url.match(/AEM-EDS-Studio-([a-z]+-[a-z0-9]+)\./) || [])[1] || "releases" };
      } else if (/github\.com\/piotrgodycki\/aem-eds-kit/.test(url)) cta = "github";
      else if (/npmjs\.com\/package\/aem-eds-kit/.test(url)) cta = "npm";
      else if (href === "#quickstart" || /index\.html#quickstart$/.test(href)) cta = "quick_start";
      else if (/docs\.html#install/.test(href)) cta = "install_guide";
      else if (/(^|\/)docs\.html/.test(href) && location !== "nav" && location !== "mega_menu") cta = "docs";
      else if (/github\.com\/piotrgodycki\/aem-eds-studio/.test(url)) cta = "studio";

      if (cta) return track("cta_click", { cta, location, link_url: url, link_text: text(el), ...extra });
      if (el.origin && el.origin !== window.location.origin && /^https?:/.test(url)) {
        return track("outbound_click", { link_url: url, link_domain: el.hostname, location });
      }
    },
    { capture: true },
  );

  // ── FAQ: which questions get opened ──
  document.querySelectorAll("details").forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) track("faq_open", { question: text(d.querySelector("summary") || d), location: where(d) });
    });
  });

  // ── Sections seen (crossing the middle of the screen, once per page view) ──
  const seen = new Set();
  const sections = document.querySelectorAll("main section[id], body > section[id], header[id]");
  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const id = en.target.id;
          if (en.isIntersecting && !seen.has(id)) {
            seen.add(id);
            track("section_view", { section: id });
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
  }

  // ── Scroll depth: 25 / 50 / 75 / 90 % ──
  const marks = [25, 50, 75, 90];
  const hit = new Set();
  let ticking = false;
  addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        if (max <= 0) return;
        const pct = (scrollY / max) * 100;
        for (const m of marks) if (pct >= m && !hit.has(m)) (hit.add(m), track("scroll_depth", { percent: m }));
      });
    },
    { passive: true },
  );
})();
