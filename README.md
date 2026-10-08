<p align="center"><img src="https://raw.githubusercontent.com/piotrgodycki/aem-eds-kit/main/.github/assets/readme-banner.png" alt="aem-eds-kit - Design frame in. EDS block out." width="100%"></p>

# aem-eds-kit

[![npm version](https://img.shields.io/npm/v/aem-eds-kit.svg)](https://www.npmjs.com/package/aem-eds-kit)
[![npm downloads](https://img.shields.io/npm/dm/aem-eds-kit.svg)](https://www.npmjs.com/package/aem-eds-kit)
[![CI](https://github.com/piotrgodycki/aem-eds-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/piotrgodycki/aem-eds-kit/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

**Turn a design into an EDS block** - JS, CSS and a Universal Editor model - without leaving your terminal.

`aem-eds-kit` gives you the `eds` command. Paste a design link - Figma, Google Stitch, Canva, Sketch or Framer - and it hands the design to the AI agent you already use (Claude Code, Cursor or Codex); the agent reads it through MCP and writes production-ready code straight into your repo. It also scaffolds blocks, previews them in your browser, and keeps your project healthy with a few quick audits.

It lives next to `@adobe/aem-cli` (your local dev server) and handles everything around it.

## Install

```bash
npm install -g aem-eds-kit
```

<details>
<summary><strong>Or let your AI agent install it</strong> (copy-paste prompt)</summary>

```text
Goal:
Ensure Node.js v20 or newer is installed, then install the aem-eds-kit CLI and verify it.

Check first: run `node --version`. If the major version is 20 or higher, do not install or modify Node.js.
If Node.js is missing or older than v20, install an official Node.js release (major version 20 or higher).

Install policy: use an existing package manager only if it is already installed. Do not install Homebrew,
winget, Chocolatey, Scoop, nvm, fnm, or another package manager just for this task.
- macOS: Homebrew if already installed, otherwise the official Node.js `.pkg` installer.
- Windows: winget if already installed, otherwise the official Node.js `.msi` installer.
- Linux: the system package manager if it can install v20+, otherwise NodeSource (Debian/Ubuntu, RHEL/Fedora)
  or the official Node.js standalone Linux binary. Downloads: https://nodejs.org/download/release/latest/

Verify Node: run `node --version` again; only continue if the major version is 20 or higher.
Install the CLI: run `npm install -g aem-eds-kit`. Verify: run `eds --version`.

Final step: from inside an EDS project (a folder with fstab.yaml, head.html, or scripts/scripts.js), run `eds`
for the interactive menu, or `eds init` to set up a freshly cloned Adobe EDS boilerplate.
```

</details>

Node.js 20 or newer. That's all the setup there is - `eds` now works in **any folder**. Step into your EDS project (anywhere with a `fstab.yaml`) and the CLI finds the project root for you:

```bash
cd ~/my-eds-site
eds figma setup                              # one-time: connect your AI agent to Figma
eds block from-design "<figma-url>" --name hero
```

`eds` runs on your machine, not on your site - it never adds a single byte to what your visitors download.

## Interactive mode

Run `eds` with no command and it opens an **interactive menu** that walks you through every feature (set up the project, generate a block from a design, migrate a classic AEM component, scaffold, create a block, add an integration, preview, Admin API, audits, Figma setup). Most commands are also interactive on their own when you omit arguments - e.g. `eds init`, `eds block from-design` (wizard), `eds migrate component`, `eds scaffold`, `eds integrate`, `eds preview`. Flags and subcommands still work for CI / power users.

A full A-Z reference of every command lives on the docs page: **https://piotrgodycki.github.io/aem-eds-kit/docs.html**

## Quick start

```bash
eds                              # interactive menu

# Just cloned an EDS boilerplate? Set it up for your authoring model
eds init

# One-time: configure Figma MCP for your AI agent
eds figma setup

# Generate a block from a Figma design (wizard, or pass a URL)
eds block from-design

# Scaffold the standard UE components + blocks
eds scaffold ue
eds scaffold blocks

# Add a third-party service (GTM, GA4, chat…)
eds integrate

# Audit your project
eds doctor
```

## From zero to a published page

The full path, command by command. This example targets **DA (da.live)** authoring.

```bash
# 1. Install the CLI
npm i -g aem-eds-kit

# 2. Set up the project (pick DA, enter org + site). Writes fstab + CI + naming.
eds init --authoring da --org my-org --site my-site

# 3. Scaffold the Universal Editor config + helper functions
eds scaffold ue
eds scaffold helpers

# 4. Build blocks - from a design, from scratch, or migrated from classic AEM
eds block from-design            # paste a Figma/Stitch/Canva/Sketch/Framer link
# eds block create hero
# eds migrate component ./components/hero

# 5. Enrich a block (optional)
eds model add hero teaser        # add reusable field-group partials
eds schema block hero --type Article   # JSON-LD structured data
eds track block hero             # dataLayer click + form-submit tracking

# 6. Generate the page (initial content) and push it to DA
eds template new homepage --blocks hero,cards --push --org my-org --site my-site

# 7. Preview, then publish
eds preview /templates/homepage
eds publish /templates/homepage
```

Every step is also interactive when you omit the flags - run `eds` for the menu.

## Commands

### `eds init`

Adapt a freshly cloned EDS boilerplate to your setup in one interactive wizard. Pick the authoring model - **Universal Editor (crosswalk), DA (da.live), Google Drive or SharePoint** - and `eds` sets the project name (`package.json` + boilerplate placeholders), writes `fstab.yaml` **only when the model needs it** (UE/crosswalk doesn't), scaffolds the crosswalk config + `paths.json` for UE, optionally adds the CI workflow, then walks the **external steps** (AEM Code Sync app, content-source share, Sidekick) as a clickable checklist.

```bash
eds init                                           # interactive
eds init --name my-site --authoring da --org my-org --site my-site --yes
```

| Flag | Description |
|---|---|
| `--name <name>` | Project name (kebab-case) |
| `--authoring <model>` | `ue` \| `da` \| `gdrive` \| `sharepoint` |
| `--mountpoint <url>` | Content source URL (document models) |
| `--org <org>` / `--site <site>` | DA org / site (`--authoring da`) |
| `--no-ci` | Skip the GitHub Actions workflow |
| `--yes` | Skip prompts; apply with flags/defaults |

### `eds template new <name>`

Generate EDS page **initial content** - the EDS analog of an AEM template. In the wizard you **compose the blocks in order** (add them one by one, repeats allowed - you control the sequence and count). It always writes `templates/<name>.html`, then **routes by your authoring model** (detected from `fstab.yaml` / project markers, or `--authoring`): **DA** → push to da.live (`--push`, org/site from `.edsrc.json`/flags, `DA_TOKEN` for protected projects); **Google Docs / SharePoint** → importable doc + the external steps; **Universal Editor** → writes `templates/<name>.json` (the page's initial content: an ordered list of components with default field values from each block's model) and registers the blocks so authors can add them. Interactive when flags are omitted; `--blocks hero,cards,cards` keeps order and repeats non-interactively.

```bash
eds template new homepage                         # interactive (blocks, DA push)
eds template new homepage --blocks hero,cards --push --org my-org --site my-site
```

| Flag | Description |
|---|---|
| `--blocks <list>` | Comma-separated block ids to seed |
| `--title` / `--description` / `--area` | Page title, description, metadata label |
| `--path <path>` | Content path (default `/templates/<name>`) |
| `--authoring <model>` | Force `da` \| `gdrive` \| `sharepoint` \| `ue` (else detected) |
| `--push` | Push to DA (da.live) |
| `--org` / `--site` | DA org / site (else from `.edsrc.json`) |
| `--yes` | Skip prompts |

### `eds sandbox`

Spin up and tear down **disposable EDS sandbox repos** on GitHub - a rapid, throwaway environment you can stand up and delete in seconds. Uses the `gh` CLI (install + `gh auth login` once), so you can go from an empty folder straight to a live EDS repo.

```bash
eds sandbox new my-test          # guided: boilerplate, visibility, Code Sync, eds init
eds sandbox new my-test --ue --private --yes
eds sandbox list                 # your sandboxes (tagged eds-sandbox) + preview URLs
eds sandbox rm my-test           # delete it (with confirmation)
```

`sandbox new` creates the repo from a boilerplate (Document Authoring `adobe/aem-boilerplate` or Universal Editor `adobe/aem-boilerplate-xwalk`), clones it, tags it `eds-sandbox`, then walks you through opening the AEM Code Sync install page and running `eds init`. The preview URL is `https://main--<repo>--<owner>.aem.page/`. Deleting a repo needs the `delete_repo` scope (`gh auth refresh -s delete_repo`).

### `eds migrate component [dir]`

Start migrating a **classic AEM component** to EDS. Phase 1 is deterministic (no agent, no network): it parses the component's Touch UI dialog (`_cq_dialog/.content.xml`) and maps its Granite/Coral fields onto the **17 Universal Editor field types** - selects keep their options, multifields become repeatable containers, tabs are preserved - then writes `blocks/<name>/` with a UE model (`_<name>.json`), a `decorate()` stub (port the HTL logic), and a scoped CSS file to fill from the component's clientlib or its rendered page.

It also pulls the component's **clientlib CSS** off disk into the block's CSS when it can find one (auto-detected, or `--clientlib <dir>`): it honours `css.txt` ordering (and `#base=`), concatenates the `.css`, and flags any LESS/SCSS that needs a build. Treat it as a starting point - review the selectors and scope them under `.<block>`.

```bash
eds migrate component /path/to/apps/myproject/components/hero
eds migrate component ./components/hero --name hero --clientlib ./ui.apps/.../hero/clientlib --yes
```

Dialogs map cleanly because Granite's `sling:resourceType` set is finite. The most faithful CSS actually comes from the **rendered page** (resolves LESS vars + cascade) - that capture lands in a later phase; for now the clientlib source gets you most of the way.

### `eds track block <name>`

Instrument a block's `decorate()` with **dataLayer** tracking on demand: a delegated `block_click` (links/buttons, label from `data-track` or the element text) and `form_submit`, both pushed through `trackEvent` from `scripts/analytics.js` (created by `eds integrate gtm`). It adds the import, injects at the top of `decorate()`, is idempotent, and keeps the real parameter name. You're also offered it right after `block from-design` and `migrate component`.

```bash
eds track block hero
eds track block hero --no-submit        # clicks only
```

### `eds model add <block> [partials...]`

Compose **reusable field groups (partials)** into a block's Universal Editor model (`_<block>.json`) instead of hand-writing fields. Fields are added **by name**, so re-running never duplicates. Partials are built from typed field helpers (each sets the right `valueType`), and the same catalog is referenced in the `from-design` / `migrate` prompt so the agent reuses the standard groups.

```bash
eds model add hero teaser              # image + eyebrow + title + text + cta
eds model add cards card cta-group     # pick several
eds model add hero                     # interactive checkbox picker
```

Built-in partials: `heading`, `eyebrow`, `image`, `richtext`, `link`, `cta`, `cta-group`, `classes` (section styles), `embed`, `teaser`, `card`.

### `eds schema block <name>`

Inject a **JSON-LD (schema.org) structured-data** builder into a block's `decorate()` for SEO / rich results. Pick a type - `Article`, `FAQPage`, `BreadcrumbList`, `Product`, `Organization`, `LocalBusiness`, `Event`, `VideoObject`, `Recipe`, `HowTo` - and it appends a `<script type="application/ld+json">` to the head, built from the block's content (aliased to `root`, so it's independent of the parameter name). Idempotent; some fields are heuristic or `TODO`, so review and validate with Google's Rich Results test.

```bash
eds schema block faq --type FAQPage
eds schema block article              # interactive type picker
```

### `eds block create <name>`

Scaffolds `blocks/<name>/` with `<name>.js`, `<name>.css`, **and a Universal Editor model `_<name>.json` by default** - so the block is authorable in UE the moment it's created. Validates kebab-case naming and checks for collisions.

```bash
eds block create hero-banner             # js + css + _hero-banner.json (UE model)
eds block create hero-banner --no-ue-model   # skip the UE model
```

The generated `_<name>.json` uses the EDS block-plugin (xwalk) format (`definitions` / `models` / `filters`) with starter fields (title + heading-level select + rich text). Extend it from the **full catalog of all 17 Universal Editor field types** - see [`docs/universal-editor-fields.md`](docs/universal-editor-fields.md). `eds block from-design` picks the right field type per Figma layer automatically.

### `eds block from-design [design-url]`

Translates a design - **Figma, Google Stitch, Canva, Sketch or Framer** - into an EDS block. Run with **no URL** for a step-by-step wizard (design source, name, link, content source, UE model, screenshot, run mode). It builds a prompt with EDS conventions + your project's design tokens and hands it to your AI agent (Claude Code, Cursor, or Codex). *(This was `from-figma` before it went design-agnostic; Figma is the most battle-tested source and stays pixel-perfect.)*

The agent reads the design through its MCP connection (for Figma: `get_design_context`, `get_variable_defs`, `get_screenshot`), generates pixel-perfect code (JS + CSS) **and its Universal Editor model** by default, uses lightweight **placeholders** for not-yet-authored content (so the block is visible before Universal Editor takes over), then self-verifies. You see a **live, colour-coded log** with per-phase timings, and on success the **live preview starts automatically**.

```bash
eds block from-design                               # interactive wizard
eds block from-design "<figma-url>" --name hero     # non-interactive
eds block from-design "<figma-url>" --dry-run       # just build the prompt
```

| Flag | Description |
|---|---|
| `--name <name>` | Override the inferred block name |
| `--source <type>` | Content source: `document` \| `ue` \| `cf` \| `mixed` |
| `--agent <type>` | Force `claude` \| `cursor` \| `codex` \| `none` |
| `--dry-run` | Build the prompt only |
| `--no-ue-model` | Skip the Universal Editor model |
| `--no-screenshot` | Skip the screenshot (fewer tokens; structural verification) |
| `--no-serve` | Don't auto-start the live preview |
| `--yes` | Skip confirmation prompts |

**Supported Figma URL formats:**
- `figma.com/design/:fileKey/:name?node-id=...`
- `figma.com/file/:fileKey/:name?node-id=...` (legacy)
- `figma.com/design/:fileKey/branch/:branchKey/:name` (branches)
- `figma.com/board/...`, `figma.com/make/...`, `figma.com/slides/...`

### `eds figma setup`

Interactive wizard that:
1. Detects installed AI agents (Claude Code, Cursor, Codex)
2. Checks if Figma MCP is configured for your agent
3. Shows install commands if not
4. Saves preferences to `~/.eds/config.json`

### `eds block list`

Lists all blocks in the project with their file status and Figma source info.

```bash
eds block list
eds block list --json          # machine-readable output
```

### `eds block preview <name>`

Serves a **live, breakpoint-switchable preview** of a block in your browser - no build, no files written to your project (the harness is served from memory). A dropdown switches widths inside an iframe, and **edits live-reload** the browser (the server watches the block folder).

```bash
eds block preview hero
eds block preview hero --widths 375,768,1280   # custom breakpoints
eds block preview hero --port 9000 --no-open
```

### `eds scaffold ue` · `eds scaffold blocks`

Scaffold Universal Editor components deterministically (no agent). `eds scaffold ue` writes/merges the three UE config files with the default-content components and a **`field-reference` block showing all 17 field types** + a multifield. `eds scaffold blocks` scaffolds standard Block Collection blocks (hero, cards, columns, accordion, embed) with UE models. Run `eds scaffold` for an interactive picker.

```bash
eds scaffold ue
eds scaffold blocks            # all, or: eds scaffold blocks hero cards
eds scaffold helpers           # scripts/utils.js with common EDS helpers
```

`eds scaffold helpers` writes `scripts/utils.js` - **tick the helpers you want** in an interactive checkbox (dependencies are pulled in automatically), or pass names. Available: `toCamelCase`, `getPagePath` / `getLanguageRootPath`, `getSiteArea` (top-level area like `blog`), `getEnvironment`, `getContentTopic`, `isUEEdit` / `isUEPreview` / `isUE`, and `getMetadata`.

```bash
eds scaffold helpers                    # interactive picker
eds scaffold helpers getSiteArea getEnvironment
```

### `eds scaffold ci`

Generate a GitHub Actions workflow (`.github/workflows/eds.yml`) that gatekeeps every PR and push to `main`: it installs deps, runs the project's own `lint`/`build` (if defined), then the eds audits - `doctor`, `audit loading`, `audit security` - which exit non-zero on problems. No agent, deterministic. Also offered in the interactive `eds scaffold` picker.

```bash
eds scaffold ci
```

### `eds integrate [type]`

Add a third-party service to `scripts/delayed.js` (the EDS-correct place - delayed phase, after LCP, zero CWV impact). Chat widgets use the facade pattern. **GTM** gets a `scripts/analytics.js` module (exports `trackEvent` / `loadGTM`, initialises the dataLayer, reads the container id from the `gtm-id` metadata) plus a `scripts/page-meta.js` (default-exported `pageMetaPush`); `delayed.js` imports both and pushes page metadata before GTM initialises.

```bash
eds integrate                  # interactive
eds integrate gtm              # gtm · ga4 · chat · cookiebot · custom
```

- A dropdown switches the block between breakpoints inside an `<iframe>`, so the block's media queries fire against the chosen width - a **width-honest** comparison that isn't distorted by your monitor size.
- Breakpoints come from the block's `.eds-meta.json` (`breakpoints`, marking which widths have a real Figma frame → pixel-perfect) and fall back to `375 / 768 / 1280` or `--widths`.
- If the block has a `.eds-meta.json` with a Figma source, an **Open in Figma** link is shown.
- Authored sample content is read from `blocks/<name>/_<name>.preview.html` if present; otherwise a placeholder is used (and the chrome tells you to add one).

> Not to be confused with `eds preview <paths...>` (lower down), which previews **pages** via the AEM Admin API.

### `eds preview <path...>`

Preview pages via the AEM Admin API (`admin.hlx.page`).

```bash
eds preview /index
eds preview /blog/my-post /about
eds preview /index --org my-org --site my-repo --ref main
```

### `eds publish <path...>`

Publish pages to live via the AEM Admin API.

```bash
eds publish /index
eds publish /blog/my-post /about
```

Both `preview` and `publish` read `org`, `site`, and `ref` from `.edsrc.json` so you don't need to pass flags every time:

```json
{
  "admin": {
    "org": "my-github-org",
    "site": "my-repo",
    "ref": "main"
  }
}
```

### `eds doctor`

Audits your EDS project for common issues:
- `fstab.yaml` exists and is valid YAML
- `head.html` present
- Every block folder has a matching `.js` file
- Every block has a Universal Editor model (`_<name>.json` or an entry in `component-models.json`)
- No `console.log` in block code
- `helix-query.yaml` valid if present
- Figma-generated blocks: warns if last sync > 30 days
- CLI config present

```bash
eds doctor
eds doctor --json
```

### `eds audit loading`

Audits the EDS three-phase loading strategy and LCP budget:
- No render-blocking scripts / extra stylesheets / preload-preconnect / font preloads in `head.html`
- `scripts.js` has `loadEager` / `loadLazy` / `loadDelayed`; eager phase loads only the first section
- `styles.css` within the LCP budget; no `@import` chains
- No heavy libraries (`jquery`, `gsap`, `swiper`, …) or `document.write` in blocks
- Block CSS is scoped to `.<block-name>` (prevents style leakage / CLS)

```bash
eds audit loading
eds audit loading --json
```

### `eds audit security`

Scans the project for **vulnerabilities** and **exploit patterns** - a defensive check you can run before every PR or in CI.

- **Dependency vulnerabilities** - runs `npm audit` and summarizes critical/high/moderate/low (skipped gracefully if there's no `package.json`/lockfile).
- **Exploit scan** - static analysis of `blocks/`, `scripts/`, and HTML for:
  - `eval()`, `new Function()`, `document.write()` - code-execution vectors
  - dynamic `innerHTML` / `insertAdjacentHTML` / `javascript:` URLs - XSS
  - hardcoded secrets, AWS keys, private keys, bearer tokens
  - `http://` resources (mixed content), `target="_blank"` without `rel="noopener"` (reverse tabnabbing)
  - `postMessage('*')`, inline event handlers, leftover `console.log`

Findings are grouped by severity (CRIT / HIGH / MOD / LOW). Exits non-zero if any **critical or high** issue is found - wire it straight into CI.

```bash
eds audit security
eds audit security --json      # for CI / tooling
```

The vendored framework (`scripts/aem.js` / `lib-franklin.js`) is never flagged.

## How Figma integration works

You don't need a Figma API token. `aem-eds-kit` never talks to Figma directly - it writes a focused prompt and hands it to the AI agent you already use, which has its own Figma MCP connection. The agent reads the design and writes the files; `eds` orchestrates the handoff and checks the result.

```
┌──────────┐     prompt      ┌─────────────┐    MCP calls    ┌───────────┐
│  eds-cli │ ──────────────→ │ Claude Code │ ──────────────→ │ Figma MCP │
│          │                 │ / Cursor    │ ←────────────── │  Server   │
│          │ ←────────────── │ / Codex     │   design data   └───────────┘
│          │   block files   └─────────────┘
└──────────┘
```

The prompt includes:
- Figma file key and node ID to fetch
- EDS block conventions (`decorate(block)`, vanilla JS, semantic HTML, full-width/mobile-first)
- CSS custom properties from your `styles/styles.css`
- Universal Editor model generation (fields mapped from Figma layers/variants) - on by default
- Lighthouse performance requirements + pixel-perfect self-verification
- Output file structure

## Configuration

Priority: CLI flags → env vars → `.edsrc.json` (project) → `~/.eds/config.json` (global)

**`~/.eds/config.json`** (created by `eds figma setup`):
```json
{
  "agent": "claude"
}
```

**`.edsrc.json`** (project root, optional):
```json
{
  "admin": {
    "org": "my-org",
    "site": "my-site",
    "ref": "main"
  }
}
```

## Global flags

| Flag | Description |
|---|---|
| `--verbose` | Debug-level output |
| `--quiet` | Errors only |
| `--json` | Machine-readable JSON output |
| `--no-color` | Disable colors (also respects `NO_COLOR` env) |

## Development

```bash
git clone <repo-url> && cd eds-cli
npm install
```

### Scripts

```bash
npm run dev -- --help          # run via tsx, no build needed
npm run build                  # build to dist/
npm test                       # vitest
npm run typecheck              # tsc --noEmit
npm run lint                   # biome check
npm run lint:fix               # biome auto-fix
```

### Testing locally

**Option A - global link (recommended):**

```bash
npm run build && npm link
eds --help                     # available everywhere
```

After code changes, re-run `npm run build` to update.

**Option B - dev mode (no build):**

```bash
npm run dev -- doctor
npm run dev -- block create my-block
npm run dev -- block from-design "https://www.figma.com/design/abc/File?node-id=1-2" --dry-run
```

**Option C - run from a test EDS project:**

The repo includes a fixture project you can use:

```bash
cd tests/fixtures/sample-eds-project

# with global link
eds doctor
eds block create my-block
eds block from-design "https://www.figma.com/design/abc/File?node-id=1-2" --dry-run --name hero

# without link
npx tsx ../../../src/bin/eds.ts doctor
```

### Testing Figma integration (dry-run)

You don't need a real Figma file to test prompt generation:

```bash
eds block from-design "https://www.figma.com/design/abc123/Test?node-id=42-100" \
  --dry-run --name hero-banner
```

This parses the URL, builds the full agent prompt (with project tokens, EDS conventions), saves it to a temp file, and prints it. No agent or Figma access needed.

### Running tests

```bash
npm test                       # run all tests once
npm run test:watch             # watch mode
```

Tests use fixtures in `tests/fixtures/` - a sample EDS project and recorded Figma MCP responses.

## Roadmap

- **Design sources** - deepen Google Stitch, Canva and Sketch support alongside Figma (the wizard's first step already picks the source), and a generic `eds setup` in place of `eds figma setup`.
- **Screenshot-to-block** - build a block from a plain image (harder: no structured layout/measurements, so pixel-perfect is tougher).
- **Tokens & sync** - design variables → CSS custom properties, and incremental re-sync of an existing block (`--update`).
- **Headless & CI** - a direct MCP client (no agent needed) for CI/CD, plus `eds lighthouse`, `eds rum` and `eds migrate page`.

## Trademarks & affiliation

`aem-eds-kit` is an independent, community project. It is **not affiliated with, endorsed by, or sponsored by Adobe or Figma.** It ships none of their code - it only generates code that follows the public, open-source AEM Edge Delivery Services conventions and interoperates with tools you install yourself.

Adobe, AEM, Edge Delivery Services and Universal Editor are trademarks of Adobe Inc. Figma is a trademark of Figma, Inc. These names are used only to describe compatibility.

## License

MIT - see [LICENSE](LICENSE).
