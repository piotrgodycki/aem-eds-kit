# aem-eds-cli

CLI for AEM Edge Delivery Services — scaffolding blocks, translating Figma designs to EDS blocks via MCP, and auditing projects.

Complementary to `@adobe/aem-cli` (dev server). This tool handles the workflow around it.

## Install

```bash
npm install -g aem-eds-cli
```

Requires Node.js 20+.

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
