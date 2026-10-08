# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Smaller published package (~206 kB → ~73 kB packed; 808 kB → ~220 kB
  unpacked).** The build no longer ships a source map (it was ~60% of the
  package; re-enable ad hoc with `tsup --sourcemap`) and now minifies the single
  bundled binary (`dist/bin/eds.js` 265 kB → ~170 kB).

### Fixed
- Removed the dangling `main`/`types` fields that pointed at a never-built
  `dist/index.js` (a bare `import "aem-eds-kit"` would have failed) - the package
  is a CLI, exposed via its `bin`.

### Added
- **`block from-design` records the design's frame widths** in the block's
  `.eds-meta.json` (`breakpoints`), so `eds block preview` is width-honest at the
  **real design widths**, not a fixed device set. The agent writes the widths it
  reads from the design (prompt instruction), `--widths 390,768,1440` overrides,
  and 375/768/1280 remains the fallback. New `src/lib/figma/breakpoints.ts`
  (`parseWidths` / `normalizeBreakpoints`), extended `edsMetaSchema`.
- **`eds init` writes a local-dev `.env` + `xwalk.json` by default.** `.env`
  carries the `aem up` config (`AEM_OPEN=/`, `AEM_PORT=3007`, `AEM_PAGES_URL`
  prefilled from the git remote); it's never overwritten and always gitignored.
  `xwalk.json` (Universal Editor multi-field enabled) is written for UE projects.
  Opt out with `--no-env` / `--no-xwalk`. Standalone `eds scaffold env` and
  `eds scaffold xwalk` (re)generate either on demand.
- **`eds ue check` / `eds ue open` - light Universal Editor helpers.** No Docker,
  no local AEM SDK, no local UE Service. `ue check` is an offline readiness
  report (UE config files present + which blocks have a model, so you know which
  are editable). `ue open [path]` builds and opens the hosted Universal Editor
  deep link for your cloud author, deriving the preview host
  (`main--<repo>--<owner>.aem.page`) from the git remote; `--org`, `--ref`,
  `--url`, `--no-open` to tweak.
- **Sandbox never overwrites an existing repo.** `eds sandbox new` now checks
  whether `<owner>/<name>` already exists and refuses up front with a clear
  message (in addition to the GitHub template API, which never clobbers). Guards
  both the API and `gh` paths.
- **Secure GitHub sandboxes guide** (site): least-privilege setup - a fine-grained
  token scoped to a single repo, or a dedicated sandbox org via `--org` - plus the
  minimal permissions, token storage, and the overwrite/teardown safety notes.
  Linked from the docs and README; added to the sitemap.

## [0.4.19] - 2026-10-08

### Added
- **`eds sandbox login` / `logout` - GitHub auth without `gh`.** The sandbox now
  authorizes GitHub itself: the OAuth **Device Flow** (browser authorize) when an
  OAuth app is configured (`EDS_GITHUB_CLIENT_ID`), or a Personal Access Token
  otherwise; `GITHUB_TOKEN`/`GH_TOKEN` and an authenticated `gh` are also accepted
  (fallback). Repos are created/listed/deleted via the GitHub REST API. The token
  is stored owner-only (mode 0600) in `~/.eds/github.json`. `login` guides you to
  a **least-privilege fine-grained token** (ideally scoped to a dedicated sandbox
  org via `--org`), so nothing outside your sandboxes is exposed. The CLI only
  ever lists sandboxes (by the `eds-sandbox` topic) and targets named repos.

## [0.4.18] - 2026-10-08

### Added
- **`eds sandbox`** - spin up and tear down disposable EDS sandbox repos on
  GitHub (via the `gh` CLI). `sandbox new <name>` creates a repo from a boilerplate
  (Document Authoring or Universal Editor / crosswalk), tags it `eds-sandbox`, and
  a guided wizard walks you through visibility, opening the AEM Code Sync install
  page, and running `eds init`. `sandbox list` shows your sandboxes with their
  preview URLs; `sandbox rm <name>` deletes one (with confirmation). From an empty
  folder to a live EDS environment - and gone again - in seconds. Needs the
  globally installed CLI and an authenticated `gh`.

### Added
- **`eds template new` composes blocks in order.** The wizard adds blocks one by
  one (repeats allowed) so you control the exact sequence and count, instead of
  an unordered checkbox.
- **Universal Editor initial content.** For the UE model, `template new` now
  writes `templates/<name>.json` - the page's initial content as an **ordered
  list of components with default field values** read from each block's model
  (`_<block>.json`), plus registers the blocks so authors can add them. The EDS
  analog of an AEM editable template's initial content.

### Changed
- **`eds template new` is now authoring-aware.** It detects the model from
  `fstab.yaml` / project markers (or `--authoring da|gdrive|sharepoint|ue`) and
  routes the generated page: **DA** push (existing), an **importable doc** for
  **Google Docs / SharePoint**, and for **Universal Editor** it registers the
  seeded blocks in `component-filters.json` (so authors can add them) and points
  to the AEM editable template. Completes the per-model template paths shown as
  an infographic on the docs page.

### Added
- **`eds template new <name>`** - generate EDS page **initial content** (the EDS
  analog of an AEM template): a document of sections + chosen blocks + a metadata
  block. Writes `templates/<name>.html` locally and, with `--push`, pushes it to
  **DA (da.live)** via the source API (org/site from `.edsrc.json` or flags;
  `DA_TOKEN` for protected projects). `--path`, `--title`, `--description`,
  `--blocks`, `--area`. Also in the menu. (UE/crosswalk templates come next.)
- Docs: a **"From zero to a published page"** step-by-step command path.

## [0.4.14] - 2026-10-08

### Added
- **`eds schema block <name>` (JSON-LD)** - inject a schema.org structured-data
  builder into a block's `decorate()`. Types: Article, FAQPage, BreadcrumbList,
  Product, Organization, LocalBusiness, Event, VideoObject, Recipe, HowTo.
  Idempotent, reads the block content via a `root` alias, appends a
  `<script type="application/ld+json">` to the head. `--type`, interactive picker.
- **`eds scaffold helpers`** - write `scripts/utils.js`, picking the helpers you
  want in an interactive checkbox (dependencies pulled in automatically) or by
  name: `toCamelCase`, `getPagePath` / `getLanguageRootPath`, `getSiteArea`
  (top-level area, e.g. blog), `getEnvironment`, `getContentTopic`, `isUEEdit` /
  `isUEPreview` / `isUE`, `getMetadata`. Also in the `eds scaffold` picker.

## [0.4.13] - 2026-10-08

### Added
- **Model partials & helpers** - a library of reusable Universal Editor field
  groups (heading, image, link, cta, cta-group, classes, eyebrow, richtext,
  embed, teaser, card) built from typed field builders (correct `valueType` per
  component), plus **`eds model add <block> [partials...]`** to compose them into
  a block's `_<block>.json` (added by name, never duplicated). The from-design /
  migrate prompt now lists the catalog so the agent reuses the standard groups
  instead of inventing fields. Also in the menu.

### Added
- **Framer** as a design source for `block from-design` (alongside Figma, Google
  Stitch, Canva and Sketch) - the agent reads the project through its Framer MCP
  connection. Also added a copy-paste **AI-agent setup prompt** to the landing +
  README (checks Node 20+, installs the CLI, verifies).

### Changed
- Landing version pill shows `v0.4` (minor) instead of chasing every patch.

### Added
- **`eds track block <name>`** - instrument a block's `decorate()` with dataLayer
  tracking on demand: delegated `block_click` (links/buttons, label from
  `data-track` or text) and `form_submit`, pushed via `trackEvent` from
  `scripts/analytics.js`. Adds the import and injects at the top of decorate,
  idempotent, keeps the real parameter name. `--no-click` / `--no-submit`. Also
  offered right after `block from-design` and `migrate component`, and in the menu.

## [0.4.10] - 2026-10-08

### Changed
- **`eds integrate gtm`** now emits a proper module instead of the inline IIFE:
  `scripts/analytics.js` (exports `trackEvent` / `loadGTM`, **initialises the
  dataLayer**, reads the id from `gtm-id` metadata with a configured fallback,
  idempotent, `Date.now()`, no dead `<noscript>` iframe) and `scripts/page-meta.js`
  (default-exported `pageMetaPush`). `delayed.js` imports both and pushes page
  metadata before GTM initialises. Fixes the "dataLayer is undefined" crash of
  the old snippet.

### Added
- `eds migrate component` now pulls the component's **clientlib CSS** off disk
  into the block's CSS (auto-detected, or `--clientlib <dir>`): honours
  `css.txt` ordering + `#base=`, concatenates the `.css`, and flags any
  LESS/SCSS that needs a build. A starting point to review and scope under
  `.<block>` (the faithful, rendered-CSS path comes in a later phase).

## [0.4.8] - 2026-10-07

### Added
- **`eds migrate component <dir>`** - start migrating a classic AEM component to
  EDS. Phase 1 (deterministic, no agent/network): parses the Touch UI dialog
  (`_cq_dialog/.content.xml`) and maps its Granite/Coral fields onto the 17
  Universal Editor field types - selects keep their options, multifields become
  repeatable containers, tabs are preserved - then writes `blocks/<name>/` with
  a UE model, a decorator stub, and a scoped CSS file to fill from the clientlib
  or rendered page. Also in the `eds` menu.

## [0.4.7] - 2026-10-07

### Changed
- Consistent "no EDS project markers found" message across every command.

## [0.4.6] - 2026-10-07

### Added
- **`eds init`** - adapt a freshly cloned EDS boilerplate to your authoring model
  in one interactive wizard: pick Universal Editor (crosswalk), DA (da.live),
  Google Drive or SharePoint; set the project name (package.json + boilerplate
  placeholders); generate `fstab.yaml` only when the model needs it; scaffold the
  crosswalk config + `paths.json` for UE; optionally add the CI workflow; then
  walk the external steps (code-sync, content share, Sidekick) as a clickable
  checklist. Also in the `eds` menu. Flags: `--name`, `--authoring`,
  `--mountpoint`, `--org`, `--site`, `--no-ci`, `--yes`.

## [0.4.5] - 2026-10-07

### Fixed
- Project-root detection no longer requires `fstab.yaml`. Universal Editor /
  crosswalk and Document Authoring projects often don't have one, which made
  every command (and the generated CI) fail with "Not inside an EDS project".
  A root is now any ancestor with `fstab.yaml`, `head.html`, `scripts/scripts.js`,
  `scripts/aem.js`, `component-definition.json`, `paths.json` or `helix-query.yaml`.
- `eds doctor` treats a missing `fstab.yaml` as a warning, not a hard failure,
  so `scaffold ci`'s doctor step doesn't break CI for fstab-less projects.

## [0.4.4] - 2026-10-07

### Added
- **`eds scaffold ci`** - generate a GitHub Actions workflow (`.github/workflows/eds.yml`)
  that runs the project's own `lint`/`build` (if present) plus the eds audits
  (`doctor`, `audit loading`, `audit security`) as a PR gatekeeper. Also offered
  in the interactive `eds scaffold` picker. Deterministic, no agent.

## [0.4.3] - 2026-10-06

### Changed
- CLI: a blinking accent caret now trails the animated logo line at the
  interactive entry points, matching the landing terminal.

### Fixed
- Landing hero headline no longer wraps "Design frame in." onto three lines
  (tightened the clamp + tracking so each clause stays on one line).

## [0.4.2] - 2026-10-06

### Fixed
- README banner now uses an absolute `raw.githubusercontent.com` URL so it
  renders everywhere - npmjs rewrites relative links, but the GitHub Packages
  page does not, so the relative path showed a broken image there.

### Changed
- CI: the GitHub Packages publish step tolerates an already-published version
  (409) instead of failing the whole workflow on re-runs.
- Added a dependency-free `.githooks/pre-commit` that auto-bumps the patch
  version whenever `src/` changes are committed (wired via `core.hooksPath`).

## [0.4.1] - 2026-10-06

### Changed
- Animated the five accent dots at interactive entry points (`eds` menu and
  `block from-design`): a highlight bounces across them, then settles. Static
  fallback when piped or with `--no-color`.
- Removed the maker credit from the brand lockup and dropped "× Figma" from the
  default logo tagline (it reads as design-agnostic now).

### Fixed
- Docs page links (logo / Home / nav) pointed at `/` and 404'd on the project
  Pages path - now relative to `index.html`.

## [0.4.0] - 2026-10-06

Design-agnostic generation, a full interactive configurator, and the first version
actually installable from npm (0.3.0 was unpublished before it shipped).

### Added
- **`eds block from-design [url]`** - generate a block from **Figma, Google Stitch,
  Canva or Sketch**. The wizard's first step picks the design source; Figma keeps its
  pixel-perfect MCP path (`get_design_context` / `get_variable_defs` /
  `get_screenshot`), other providers pass a design reference read through their own MCP.
- **Interactive configurator everywhere** - `eds` with no command opens a menu, and
  `from-design`, `scaffold`, `integrate` and the Admin API are step-by-step wizards
  when run without arguments.
- **`eds scaffold ue` / `eds scaffold blocks`** - deterministic (no agent) Universal
  Editor components + a `field-reference` block covering all 17 field types and a
  multifield, plus standard Block Collection blocks.
- **`eds integrate`** - add GTM / GA4 / chat / consent to `scripts/delayed.js`
  (delayed phase, facade pattern for chat widgets).
- Live, colour-coded agent log with per-phase timings and a spinner; the live preview
  **auto-starts** after generating (and live-reloads if one is already running).

### Changed
- Renamed **`block from-figma` → `block from-design`** (the figma-named command is
  gone). Not-yet-authored content uses lightweight **placeholders** instead of
  bundling design assets, so the block is visible before Universal Editor takes over.
- The brand logo prints **once per run** (no repeat when entering a command from the
  menu); CLI logo + dots use the landing accent `#ff5a36`.

## [0.3.0] - 2026-10-05

First public release, published to npm as **`aem-eds-kit`** (the command stays `eds`).
Delivers the full pipeline in one shot: **Figma → pixel-perfect block → Universal
Editor authoring interface**.

### Added
- **`eds block from-figma <url>`** - translate a Figma frame/component into an EDS
  block. Builds a prompt (project tokens + EDS conventions), runs it through your AI
  agent (Claude Code / Cursor / Codex) which reads the design via Figma MCP
  (`get_design_context`, `get_variable_defs`, `get_screenshot`), generates
  pixel-perfect JS + CSS, and self-verifies against the screenshot. Post-generation
  verification of the produced files.
- **Universal Editor model by default** - `block create` and `block from-figma`
  generate the UE model (`_<name>.json`, xwalk `definitions`/`models`/`filters`)
  so blocks are authorable in UE immediately. Figma text/image/link layers and
  component variants are mapped to UE fields (variants → `select` → CSS modifier).
  Opt out with `--no-ue-model`.
- **`eds block preview <name>`** - live, breakpoint-switchable preview served in the
  browser (dependency-free in-memory server). Width-honest `<iframe>` switcher
  (375 / 768 / 1280 / Full) reads breakpoints and the Figma link from the block's
  `.eds-meta.json`. `--port`, `--widths`, `--no-open`.
- **`eds block create <name>`** - scaffold a block (JS + CSS + UE model).
- **`eds block list`** - list blocks with file/UE/Figma status (`--json`).
- **`eds figma setup`** - configure Figma MCP for your AI agent.
- **`eds doctor`** - project audit (fstab, head.html, per-block JS, UE model,
  `console.log`, Figma-sync freshness, config). `--json`.
- **`eds audit loading`** - three-phase loading / LCP-budget audit. `--json`.
- **`eds audit security`** - `npm audit` (dependency vulnerabilities) + static
  exploit scan (XSS, `eval`, dynamic `innerHTML`, secrets, AWS/private keys, bearer
  tokens, mixed content, `target="_blank"` tabnabbing, `postMessage('*')`, inline
  handlers). Severity-grouped, `--json`, non-zero exit on critical/high.
- **`eds preview` / `eds publish <paths...>`** - preview/publish pages via the AEM
  Admin API.
- Branded CLI UX: gradient ANSI "EDS" wordmark (shown on help and command entry
  points), Adobe Spectrum palette, aligned status tables and summary boxes.
  Global flags `--verbose`, `--quiet`, `--json`, `--no-color`.
- Conventions baked into generation: blocks are full-width (full-bleed) and
  mobile-first by default; content capped for readability.

### Notes
- The CLI is a dev tool - it ships nothing to your site bundle (0 bytes, no LCP
  impact). Published tarball ~74 kB.

## [0.2.0] - internal

Branded UX layer, shared presentation module, security audit, responsive preview
harness, gradient ANSI logo. Not published (superseded by 0.3.0).

## [0.1.0] - internal

Initial CLI scaffold: `block create`, `block from-figma`, `block list`,
`figma setup`, `doctor`, `preview`, `publish`. Not published.

[Unreleased]: https://github.com/piotrgodycki/aem-eds-kit/compare/v0.4.19...HEAD
[0.4.19]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.19
[0.4.18]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.18
[0.4.17]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.17
[0.4.16]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.16
[0.4.15]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.15
[0.4.14]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.14
[0.4.13]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.13
[0.4.12]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.12
[0.4.11]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.11
[0.4.10]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.10
[0.4.9]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.9
[0.4.8]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.8
[0.4.7]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.7
[0.4.6]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.6
[0.4.5]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.5
[0.4.4]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.4
[0.4.3]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.3
[0.4.2]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.2
[0.4.1]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.1
[0.4.0]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.3.0
