# aem-eds-cli

CLI for AEM Edge Delivery Services — scaffolding blocks, translating Figma designs to EDS blocks via MCP, and auditing projects.

Complementary to `@adobe/aem-cli` (dev server). This tool handles the workflow around it.

## Install

Requires Node.js 20+.

```bash
# From npm (once published)
npm install -g aem-eds-cli
```

**From a tarball** (first releases, before npm publish) — build it, then install the `.tgz` globally:

```bash
npm run build && npm pack          # → aem-eds-cli-<version>.tgz
npm install -g ./aem-eds-cli-<version>.tgz
eds --version
```

Now `eds` works in **any folder**. A developer just `cd`s into their EDS project (anywhere with a `fstab.yaml`) and runs commands — the CLI finds the project root automatically:

```bash
cd ~/my-eds-site
eds figma setup                    # one-time
eds block from-figma "<figma-url>" --name hero
```

The CLI is a **dev tool only** — it ships nothing to your site bundle (zero bytes, zero LCP impact). Installed footprint is ~8 MB of `node_modules`; the published package itself is ~50 kB.

## Quick start

```bash
# One-time: configure Figma MCP for your AI agent
eds figma setup

# Generate a block from a Figma design (opens your AI agent)
eds block from-figma "https://www.figma.com/design/<fileKey>/<name>?node-id=42-100"

# Or just scaffold an empty block
eds block create card-list

# Audit your project
eds doctor
```

## Commands

### `eds block create <name>`

Scaffolds `blocks/<name>/` with `<name>.js`, `<name>.css`. Validates kebab-case naming and checks for collisions.

```bash
eds block create hero-banner
eds block create tabs --with-ue-model   # also generates _tabs.json for Universal Editor
```

### `eds block from-figma <figma-url>`

Translates a Figma frame/component into an EDS block. Parses the Figma URL, builds a prompt with EDS conventions and your project's design tokens, then runs it through your AI agent (Claude Code, Cursor, or Codex).

The agent calls Figma MCP (`get_design_context`, `get_variable_defs`) to read the design and generates production-ready block code.

```bash
# Full flow: generates prompt → runs agent → creates block
eds block from-figma "https://www.figma.com/design/abc123/Project?node-id=42-100"

# Preview the prompt without running the agent
eds block from-figma "https://www.figma.com/design/abc123/Project?node-id=42-100" --dry-run

# Override the inferred block name
eds block from-figma "..." --name hero-banner

# Skip confirmation prompt
eds block from-figma "..." --yes

# Force a specific agent
eds block from-figma "..." --agent claude
eds block from-figma "..." --agent none   # just save the prompt file
```

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

Serves a **live, breakpoint-switchable preview** of a block in your browser — no build, no files written to your project (the harness is served from memory). Great for checking a Figma-generated block at each width.

```bash
eds block preview hero
eds block preview hero --widths 375,768,1280   # custom breakpoints
eds block preview hero --port 9000 --no-open
```

- A dropdown switches the block between breakpoints inside an `<iframe>`, so the block's media queries fire against the chosen width — a **width-honest** comparison that isn't distorted by your monitor size.
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

Scans the project for **vulnerabilities** and **exploit patterns** — a defensive check you can run before every PR or in CI.

- **Dependency vulnerabilities** — runs `npm audit` and summarizes critical/high/moderate/low (skipped gracefully if there's no `package.json`/lockfile).
- **Exploit scan** — static analysis of `blocks/`, `scripts/`, and HTML for:
  - `eval()`, `new Function()`, `document.write()` — code-execution vectors
  - dynamic `innerHTML` / `insertAdjacentHTML` / `javascript:` URLs — XSS
  - hardcoded secrets, AWS keys, private keys, bearer tokens
  - `http://` resources (mixed content), `target="_blank"` without `rel="noopener"` (reverse tabnabbing)
  - `postMessage('*')`, inline event handlers, leftover `console.log`

Findings are grouped by severity (CRIT / HIGH / MOD / LOW). Exits non-zero if any **critical or high** issue is found — wire it straight into CI.

```bash
eds audit security
eds audit security --json      # for CI / tooling
```

The vendored framework (`scripts/aem.js` / `lib-franklin.js`) is never flagged.

## How Figma integration works

`eds-cli` does **not** call Figma APIs directly (in v0.1). Instead, it generates a structured prompt and delegates to your AI agent, which already has Figma MCP configured.

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
- EDS block conventions (`decorate(block)`, vanilla JS, semantic HTML)
- CSS custom properties from your `styles/styles.css`
- Lighthouse performance requirements
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

**Option A — global link (recommended):**

```bash
npm run build && npm link
eds --help                     # available everywhere
```

After code changes, re-run `npm run build` to update.

**Option B — dev mode (no build):**

```bash
npm run dev -- doctor
npm run dev -- block create my-block
npm run dev -- block from-figma "https://www.figma.com/design/abc/File?node-id=1-2" --dry-run
```

**Option C — run from a test EDS project:**

The repo includes a fixture project you can use:

```bash
cd tests/fixtures/sample-eds-project

# with global link
eds doctor
eds block create my-block
eds block from-figma "https://www.figma.com/design/abc/File?node-id=1-2" --dry-run --name hero

# without link
npx tsx ../../../src/bin/eds.ts doctor
```

### Testing Figma integration (dry-run)

You don't need a real Figma file to test prompt generation:

```bash
eds block from-figma "https://www.figma.com/design/abc123/Test?node-id=42-100" \
  --dry-run --name hero-banner
```

This parses the URL, builds the full agent prompt (with project tokens, EDS conventions), saves it to a temp file, and prints it. No agent or Figma access needed.

### Running tests

```bash
npm test                       # run all tests once
npm run test:watch             # watch mode
```

Tests use fixtures in `tests/fixtures/` — a sample EDS project and recorded Figma MCP responses.

## Roadmap

- **v0.2** — `eds figma pull-tokens` (Figma variables → CSS custom properties), `eds block from-figma --update` (incremental sync), `eds lighthouse`
- **v0.3** — Headless mode (`--headless`) — direct Figma MCP client via `@modelcontextprotocol/sdk`, no agent needed. For CI/CD.
- **v0.4** — Figma Code Connect integration, `eds rum`, `eds migrate page`

## License

MIT
