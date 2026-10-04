# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-10-05

First public release, published to npm as **`aem-eds-kit`** (the command stays `eds`).
Delivers the full pipeline in one shot: **Figma → pixel-perfect block → Universal
Editor authoring interface**.

### Added
- **`eds block from-figma <url>`** — translate a Figma frame/component into an EDS
  block. Builds a prompt (project tokens + EDS conventions), runs it through your AI
  agent (Claude Code / Cursor / Codex) which reads the design via Figma MCP
  (`get_design_context`, `get_variable_defs`, `get_screenshot`), generates
  pixel-perfect JS + CSS, and self-verifies against the screenshot. Post-generation
  verification of the produced files.
- **Universal Editor model by default** — `block create` and `block from-figma`
  generate the UE model (`_<name>.json`, xwalk `definitions`/`models`/`filters`)
  so blocks are authorable in UE immediately. Figma text/image/link layers and
  component variants are mapped to UE fields (variants → `select` → CSS modifier).
  Opt out with `--no-ue-model`.
- **`eds block preview <name>`** — live, breakpoint-switchable preview served in the
  browser (dependency-free in-memory server). Width-honest `<iframe>` switcher
  (375 / 768 / 1280 / Full) reads breakpoints and the Figma link from the block's
  `.eds-meta.json`. `--port`, `--widths`, `--no-open`.
- **`eds block create <name>`** — scaffold a block (JS + CSS + UE model).
- **`eds block list`** — list blocks with file/UE/Figma status (`--json`).
- **`eds figma setup`** — configure Figma MCP for your AI agent.
- **`eds doctor`** — project audit (fstab, head.html, per-block JS, UE model,
  `console.log`, Figma-sync freshness, config). `--json`.
- **`eds audit loading`** — three-phase loading / LCP-budget audit. `--json`.
- **`eds audit security`** — `npm audit` (dependency vulnerabilities) + static
  exploit scan (XSS, `eval`, dynamic `innerHTML`, secrets, AWS/private keys, bearer
  tokens, mixed content, `target="_blank"` tabnabbing, `postMessage('*')`, inline
  handlers). Severity-grouped, `--json`, non-zero exit on critical/high.
- **`eds preview` / `eds publish <paths...>`** — preview/publish pages via the AEM
  Admin API.
- Branded CLI UX: gradient ANSI "EDS" wordmark (shown on help and command entry
  points), Adobe Spectrum palette, aligned status tables and summary boxes.
  Global flags `--verbose`, `--quiet`, `--json`, `--no-color`.
- Conventions baked into generation: blocks are full-width (full-bleed) and
  mobile-first by default; content capped for readability.

### Notes
- The CLI is a dev tool — it ships nothing to your site bundle (0 bytes, no LCP
  impact). Published tarball ~74 kB.

## [0.2.0] - internal

Branded UX layer, shared presentation module, security audit, responsive preview
harness, gradient ANSI logo. Not published (superseded by 0.3.0).

## [0.1.0] - internal

Initial CLI scaffold: `block create`, `block from-figma`, `block list`,
`figma setup`, `doctor`, `preview`, `publish`. Not published.

[Unreleased]: https://github.com/piotrgodycki/eds-cli/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/piotrgodycki/eds-cli/releases/tag/v0.3.0
