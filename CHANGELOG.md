# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.78] - 2026-11-12

### Security
- **Codex runs in an OS sandbox (macOS `sandbox-exec`, Linux bubblewrap) that hides home except the project and `~/.codex`, through `codex exec` with the prompt on stdin; `eds agents` reports it as confined there** (EDS-161)

## [0.4.77] - 2026-11-12

### Fixed
- **A round of changes can change the text: the refine prompt points the agent at the preview content (`_<name>.preview.html`), where the copy lives, instead of only the JS/CSS** (EDS-159)

## [0.4.76] - 2026-11-12

### Security
- **The agent stays inside the project: Claude Code runs in `--restricted` mode where it has it, `eds agents` reports which agents are confined, and `EDS_CONFINED_ONLY=1` refuses the rest (Cursor, Codex)** (EDS-157)

## [0.4.75] - 2026-11-12

### Changed
- **Node.js 22 or newer (Node 20 reached end of life in April 2026); chalk 6 and ora 10; projects scaffolded with `eds scaffold ci` run on Node 22** (EDS-155)

## [0.4.74] - 2026-11-12

### Removed
- **Unused code found by knip (an unused entry file, a schema, seven types) and `export` on what only its own file uses; knip now runs in CI. Section banners became plain comments and three doc comments moved back to their functions** (EDS-145)

## [0.4.73] - 2026-11-12

### Fixed
- **Figma limits stated exactly, with Figma's pages as the source: "up to" 20 a month on Starter or with a View/Collab seat, and the screenshot check is one more REST or MCP call, not free; a table of what each path costs** (EDS-152)

## [0.4.72] - 2026-11-12

### Changed
- **Biome 2; fast-xml-parser 5.12, yaml 2.9.1, tsx 4.23, Playwright 1.65; unused imports and a constant removed** (EDS-150)
- **Site: a shorter hero description; the studio heading says EDS** (EDS-148)

### Fixed
- **Hero illustration: the dot passes behind the windows** (EDS-146)

## [0.4.71] - 2026-11-12

### Fixed
- **`block test` and the visual diff find Playwright, pngjs and pixelmatch installed in the project** (EDS-143)

## [0.4.70] - 2026-11-12

### Removed
- **Dead code: an unused Figma types file, three unused output helpers, an alias and unused site styles** (EDS-141)

### Fixed
- **Hero illustration: the terminal is no longer covered by the browser; the dot travels on to the block** (EDS-137)

### Changed
- **Hero illustration: the design in Figma, the agent, the block in the browser and on a phone; on phones right under the headline; the 3D stack moves to How it works** (EDS-135)

## [0.4.69] - 2026-11-09

### Added
- **Download the studio from the hero: one button, every installer in a menu below it** (EDS-131)

### Changed
- **`--screenshot` without an MCP call: Figma's REST render or the scraped page** (EDS-133)
- **Described as the agent harness for AEM Edge Delivery** (EDS-129)

## [0.4.68] - 2026-11-08

### Security
- **The agent stays in the block it writes** (EDS-121): Claude Code may write only `blocks/<name>/` and the design cache, can't read `.env`, keys or `.git`, and the prompt treats the design as data

## [0.4.67] - 2026-11-08

### Changed
- **CI on Windows and Node 20 / 22 / 24, current actions, Dependabot and CodeQL** (EDS-123)

### Fixed
- **Windows: forward-slash paths in logs and events, a clear message when a clone source doesn't exist** (EDS-123)

## [0.4.66] - 2026-11-08

### Security
- **Vulnerable dependencies fixed: Zod 4, MCP SDK 1.32, Vitest 5, esbuild 0.28** (EDS-119)

## [0.4.65] - 2026-11-08

### Changed
- **Short README and CHANGELOG, with the tech stack** (EDS-115)

### Fixed
- **Agents found on Windows** (EDS-117)

## [0.4.64] - 2026-11-08

### Added
- **`eds track page`** (EDS-113): every part of the page is identifiable
- **Download the desktop app from the site** (EDS-111)

## [0.4.63] - 2026-11-08

### Added
- **Every new version is released on its own** (EDS-109)
- **README: the desktop app** (EDS-107)
- **`eds agents`** (EDS-105): which agents `eds` can drive here (Claude Code, Cursor, Codex,…
- **dataLayer events on the site** (EDS-099)
- **Mega menu and search on the site** (EDS-097)

### Changed
- **The Publish workflow names the version** (EDS-103)

### Fixed
- **White areas around generated blocks** (EDS-101)
- **GitHub and npm icons in the desktop nav** (EDS-095)
- **`eds` run by Electron as Node** (EDS-093)

## [0.4.60] - 2026-11-06

### Added
- **`--json` event stream** (EDS-087)
- **Drafts: review rounds before a block reaches the repository** (EDS-085)
- **A docs gate in CI** (EDS-083)
- **Any web page is a design source** (EDS-065)
- **`eds new [dir]`: clone the latest EDS boilerplate locally** (EDS-055)
- **Local models: Ollama and oMLX** (EDS-051)

### Changed
- **Illustrations on the site** (EDS-077)
- **`--sample` is the project's own example hero** (EDS-073)
- **Docs and site match the CLI again** (EDS-063)
- **CHANGELOG split into the versions published on npm**

### Fixed
- **`eds draft preview|accept|refine --version` printed the CLI version** (EDS-089)
- **The site has a menu on phones** (EDS-079)
- **Scraped designs keep section backgrounds and one-sided lines** (EDS-067)
- **`eds init --yes` no longer prompts for the authoring model** (EDS-061)
- **`eds init --yes` no longer prompts for the project name** (EDS-058)
- **`eds sandbox new --ue` used a crosswalk boilerplate that doesn't exist** (EDS-056)

## [0.4.48] - 2026-10-20

### Added
- **Changelog page on the site** (EDS-048)
- **The interactive menu stays open** (EDS-042)
- **Figma REST calls are paced per minute** (EDS-041)
- **`eds migrate component` reads Classic UI dialogs** (EDS-018)

### Changed
- **README rewritten for the npm page** (EDS-047)
- **Figma REST specs are embedded as compact JSON** (part of EDS-020)
- **`eds block test` screenshots just the block** (EDS-021)

### Fixed
- **Figma limits described correctly** (EDS-040)
- **A Figma REST rate limit no longer spends your MCP budget** (EDS-039)
- **Content Fragment blocks are generated as Content Fragment blocks** (EDS-019)
- **Migrated checkboxes no longer default to ticked** (EDS-032)
- **Cursor and Codex get a large prompt through its file** (EDS-017)

## [0.4.26] - 2026-10-12

### Added
- **`eds block preview` with no name → a live gallery of every content block**
- **`block from-design` accepts a local SVG/PNG export**
- **Figma REST path**

### Changed
- **`block from-design` now fetches the design once into a cached snapshot, then generates from it**
- **MCP usage cut to one call per block**
- **Block generation defaults to the fastest model (Haiku)**
- **`eds block preview` no longer auto-launches**
- **Shorter interactive-menu labels**

### Fixed
- **Block preview blank-screen cases**
- **`eds block preview header|footer`**: now warns that these are page chrome and can't render standalone…

## [0.4.25] - 2026-10-09

### Added
- **`block from-design` records the design's frame widths**

### Changed
- **Smaller published package (~206 kB → ~73 kB packed; 808 kB → ~220 kB unpacked)**

### Fixed
- Removed the dangling `main`/`types` fields that pointed at a never-built `dist/index.js` (a bare `import…

## [0.4.22] - 2026-10-08

### Added
- **`eds init` writes a local-dev `.env` + `xwalk.json` by default**
- **`eds ue check` / `eds ue open` - light Universal Editor helpers**
- **Sandbox never overwrites an existing repo**
- **Secure GitHub sandboxes guide**

## [0.4.19] - 2026-10-08

### Added
- **`eds sandbox login` / `logout` - GitHub auth without `gh`**

## [0.4.18] - 2026-10-08

### Added
- **`eds sandbox`**: spin up and tear down disposable EDS sandbox repos on GitHub (via…
- **`eds template new` composes blocks in order**
- **Universal Editor initial content**
- **`eds template new <name>`**: generate EDS page **initial content** (the EDS analog of an AEM…
- Docs

### Changed
- **`eds template new` is now authoring-aware**

## [0.4.14] - 2026-10-08

### Added
- **`eds schema block <name>` (JSON-LD)**
- **`eds scaffold helpers`**: write `scripts/utils.js`, picking the helpers you want in an…

## [0.4.13] - 2026-10-08

### Added
- **Model partials & helpers**
- **Framer**
- **`eds track block <name>`**: instrument a block's `decorate()` with dataLayer tracking on demand

### Changed
- Landing version pill shows `v0.4` (minor) instead of chasing every patch

## [0.4.10] - 2026-10-08

### Added
- `eds migrate component` now pulls the component's **clientlib CSS** off disk into the block's CSS…

### Changed
- **`eds integrate gtm`**: now emits a proper module instead of the inline IIFE:…

## [0.4.8] - 2026-10-07

### Added
- **`eds migrate component <dir>`**: start migrating a classic AEM component to EDS. Phase 1…

## [0.4.7] - 2026-10-07

### Changed
- Consistent "no EDS project markers found" message across every command

## [0.4.6] - 2026-10-07

### Added
- **`eds init`**: adapt a freshly cloned EDS boilerplate to your authoring model in…

## [0.4.5] - 2026-10-07

### Fixed
- Project-root detection no longer requires `fstab.yaml`
- `eds doctor` treats a missing `fstab.yaml` as a warning, not a hard failure, so `scaffold ci`'s doctor…

## [0.4.4] - 2026-10-07

### Added
- **`eds scaffold ci`**: generate a GitHub Actions workflow (`.github/workflows/eds.yml`)…

## [0.4.3] - 2026-10-06

### Changed
- CLI: a blinking accent caret now trails the animated logo line at the interactive entry points, matching…

### Fixed
- Landing hero headline no longer wraps "Design frame in." onto three lines (tightened the clamp + tracking…

## [0.4.2] - 2026-10-06

### Changed
- CI: the GitHub Packages publish step tolerates an already-published version (409) instead of failing the…
- Added a dependency-free `.githooks/pre-commit` that auto-bumps the patch version whenever `src/` changes…

### Fixed
- README banner now uses an absolute `raw.githubusercontent.com` URL so it renders everywhere - npmjs…

## [0.4.1] - 2026-10-06

### Changed
- Animated the five accent dots at interactive entry points (`eds` menu and `block from-design`)
- Removed the maker credit from the brand lockup and dropped "× Figma" from the default logo tagline (it…

### Fixed
- Docs page links (logo / Home / nav) pointed at `/` and 404'd on the project Pages path - now relative to…

## [0.4.0] - 2026-10-06

### Added
- **`eds block from-design [url]`**: generate a block from **Figma, Google Stitch, Canva or Sketch**.…
- **Interactive configurator everywhere**
- **`eds scaffold ue` / `eds scaffold blocks`**
- **`eds integrate`**: add GTM / GA4 / chat / consent to `scripts/delayed.js` (delayed…
- Live, colour-coded agent log with per-phase timings and a spinner

### Changed
- Renamed **`block from-figma` → `block from-design`** (the figma-named command is gone)
- The brand logo prints **once per run** (no repeat when entering a command from the menu)

## [0.3.0] - 2026-10-05

### Added
- **`eds block from-figma <url>`**: translate a Figma frame/component into an EDS block
- **Universal Editor model by default**
- **`eds block preview <name>`**: live, breakpoint-switchable preview served in the browser…
- **`eds block create <name>`**: scaffold a block (JS + CSS + UE model)
- **`eds block list`**: list blocks with file/UE/Figma status (`--json`)
- **`eds figma setup`**: configure Figma MCP for your AI agent
- **`eds doctor`**: project audit (fstab, head.html, per-block JS, UE model,…
- **`eds audit loading`**: three-phase loading / LCP-budget audit
- **`eds audit security`**: `npm audit` (dependency vulnerabilities) + static exploit scan…
- **`eds preview` / `eds publish <paths...>`**
- Branded CLI UX: gradient ANSI "EDS" wordmark (shown on help and command entry points), Adobe Spectrum…
- Conventions baked into generation

### Notes
- The CLI is a dev tool - it ships nothing to your site bundle (0 bytes, no LCP impact)

## [0.2.0] - internal

## [0.1.0] - internal

[Unreleased]: https://github.com/piotrgodycki/aem-eds-kit/commits/main
[0.4.78]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.78
[0.4.77]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.77
[0.4.76]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.76
[0.4.75]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.75
[0.4.74]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.74
[0.4.73]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.73
[0.4.72]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.72
[0.4.71]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.71
[0.4.70]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.70
[0.4.69]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.69
[0.4.68]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.68
[0.4.67]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.67
[0.4.66]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.66
[0.4.65]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.65
[0.4.64]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.64
[0.4.63]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.63
[0.4.60]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.60
[0.4.48]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.48
[0.4.26]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.26
[0.4.25]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.25
[0.4.22]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.22
[0.4.16]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.16
[0.4.12]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.12
[0.4.9]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.9
[0.4.7]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.7
[0.4.4]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.4
[0.4.2]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.2
[0.4.1]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.1
[0.4.0]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.0
