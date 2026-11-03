// Mobile menu: below 720px the nav links fold into a toggle. Shared by every page.
(() => {
  const nav = document.querySelector(".nav");
  const toggle = nav?.querySelector(".nav-toggle");
  if (!nav || !toggle) return;
  const setOpen = (open) => {
    nav.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("nav-open")));
  nav.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia("(width > 720px)").addEventListener("change", (e) => e.matches && setOpen(false));
})();
