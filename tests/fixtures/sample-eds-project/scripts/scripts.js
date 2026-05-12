import { loadSection, loadSections, waitForFirstImage } from './aem.js';

function buildAutoBlocks(main) {
  // auto-block logic
}

function decorateMain(main) {
  buildAutoBlocks(main);
}

async function loadEager(doc) {
  decorateMain(doc.querySelector('main'));
  document.body.classList.add('appear');
  const main = doc.querySelector('main');
  await loadSection(main.querySelector('.section'), waitForFirstImage);
}

async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
}

function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
