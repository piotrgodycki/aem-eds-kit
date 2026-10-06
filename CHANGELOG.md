# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/piotrgodycki/aem-eds-kit/compare/v0.4.5...HEAD
[0.4.5]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.5
[0.4.4]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.4
[0.4.3]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.3
[0.4.2]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.2
[0.4.1]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.1
[0.4.0]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.4.0
[0.3.0]: https://github.com/piotrgodycki/aem-eds-kit/releases/tag/v0.3.0
