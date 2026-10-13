// Example page: tabs and accordion. Vanilla JS, no dependencies.
(() => {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
    });
  });

  document.querySelectorAll('.accordion-question').forEach((q) => {
    q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') !== 'true';
      q.setAttribute('aria-expanded', String(open));
      q.nextElementSibling.hidden = !open;
      q.querySelector('.accordion-icon').textContent = open ? '−' : '+';
    });
  });
})();
