---
title: "From a Figma frame to an AEM Edge Delivery block in one command"
published: false
description: "A hands-on tutorial for aem-eds-kit: generate EDS blocks from Figma, Framer or Stitch designs, migrate classic AEM components, run QA, and keep it all local with Ollama."
tags: aem, webdev, ai, cli
cover_image: https://raw.githubusercontent.com/piotrgodycki/aem-eds-kit/main/.github/assets/readme-banner.png
canonical_url: https://piotrgodycki.github.io/aem-eds-kit/
---

If you build sites on **AEM Edge Delivery Services (EDS)**, you know the loop: a designer drops a Figma link, and you rebuild the frame by hand as a block. That means a `decorate()` function, scoped CSS, a Universal Editor model and some content to preview it with. Then you do it again for the next frame.

I got tired of that loop, so I built **[aem-eds-kit](https://www.npmjs.com/package/aem-eds-kit)**. It's an open-source CLI that gives you the `eds` command. You give it a design and it gives you back a block in `blocks/<name>/`. It runs next to `@adobe/aem-cli` (your `aem up` dev server) and handles the work around it.

This post is a tutorial. By the end you will have:

1. generated a block from a design, with no Figma account needed,
2. previewed it at its real breakpoints,
3. run visual regression and accessibility checks on it,
4. migrated a classic AEM component into an EDS block,
5. (bonus) done all of it with a **local model**, so the design never leaves your machine.

---

## The highlights, before we start

If you only skim one section, make it this one.

### 1. One command, a complete block, not just a snippet
`eds block from-design <url>` writes everything a block needs: `decorate()` JS, CSS scoped under `.<block>`, the **Universal Editor model** with the right field types per layer, a preview mock in real EDS markup, and metadata with the design's frame widths. It reuses your project's design tokens instead of hard-coding hex values. You don't paste anything between windows.

### 2. Framer and Google Stitch with no API and no token
Those tools render real HTML, so `eds` opens the page in headless Chromium and reads the **computed** layout, typography, colours and geometry. Gated Stitch projects? `--auth` lets you log in once by hand, and every later scrape reuses that session.

### 3. It respects Figma's rate limits instead of fighting them
On a Starter file you get **20 calls a month**. `eds` spends **one call per block**, caches the snapshot, so refine passes and retries cost nothing, and paces REST calls per minute **across parallel runs**. On a hard cap it stops and tells you when the limit resets. It never quietly spends your MCP budget instead.

### 4. Bring your own AI, or run it fully offline
Claude Code, Cursor or Codex, using the subscription you already pay for. Or **Ollama, oMLX on Apple Silicon, LM Studio or llama.cpp**, so client designs never leave the laptop. With a local model, the CLI itself writes the files and refuses anything outside `blocks/<name>/`.

### 5. AEM component migration that doesn't need AI at all
`eds migrate component` is **deterministic**. It turns a Touch UI dialog, an **AEM 6.5 Classic UI** `dialog.xml` or an **AEMaaCS proxy component** (resolved through `sling:resourceSuperType` all the way to Core Components) into a block with a UE model, and pulls in the clientlib CSS in `css.txt` order. It was tested on **163 real components** from Core Components, WKND, We.Retail and ACS Commons.

### 6. Content Fragment blocks with one flag
`--source cf` generates an async `decorate()` that fetches the fragment, plus an `aem-content-fragment` picker in the UE model. `--source mixed` combines it with document content.

### 7. QA that catches what code review misses
- `eds block test`: pixel-diff visual regression of **the block element itself** at every design breakpoint.
- `eds block test --design`: diff of the rendered block **against the Figma design image**.
- `eds block check`: alt text, CLS-risk images, accessible names, and preview mocks nested one `<div>` deeper than real EDS markup, a bug that only shows up once real content is authored.

All of them exit non-zero, so they go straight into CI.

### 8. From an empty folder to a published page in the terminal
`eds sandbox new` creates a throwaway EDS repo on GitHub in seconds. `eds init` adapts it to UE, DA, Google Drive or SharePoint. `eds template new homepage --blocks hero,cards --push` builds the page and **pushes it to DA**, and `eds preview` / `eds publish` take it live.

### 9. An interactive menu that stays out of your way
Type `eds` and use the arrows, Enter, and Esc to go back. The menu stays open between actions, and a refine → preview → refine loop runs without retyping anything. Every action also has flags for scripts and CI.

---

## How it works (30-second version)

```
design (Figma / Framer / Stitch / PNG / SVG)
        │  fetched once
        ▼
  snapshot cache  ──►  prompt with EDS conventions + your design tokens
                                │
                                ▼
            your AI agent (Claude Code, Cursor, Codex, or a local model)
                                │
                                ▼
   blocks/hero/  hero.js · hero.css · _hero.json (UE model) · _hero.preview.html
```

A few design decisions matter in practice:

- **Your agent, your subscription.** `eds` doesn't ship its own model. It builds the prompt and hands it to the agent you already use.
- **Fetch once, generate many times.** The design is resolved into a snapshot once, then cached. Retries and refine passes never re-fetch, which matters a lot with Figma's rate limits (more on that below).
- **Figma is read, the web is scraped.** Figma paints to a canvas, so it's read through the REST API or MCP. Framer and Google Stitch render real HTML, so `eds` renders them in headless Chromium and reads the computed layout, type and colours straight off the page. No token needed.

---

## Step 0: Install

You need Node.js 20+.

```bash
npm install -g aem-eds-kit@latest
eds --version        # this tutorial uses 0.4.49 or newer
```

Already have it? `npm install -g aem-eds-kit@latest` updates it. Local models (the bonus section) arrived in 0.4.49.

You also need an EDS project, meaning a folder with `fstab.yaml`, `head.html` or `scripts/scripts.js`. If you don't have one handy, clone the latest Adobe boilerplate:

```bash
eds new my-eds-site         # DA, Universal Editor (crosswalk) or Commerce boilerplate
cd my-eds-site
eds init                    # pick your authoring model: UE, DA, Google Drive, SharePoint
```

`eds new` needs no GitHub login. It gives you a fresh git history (or `--keep-history` with an `upstream` remote, to pull boilerplate updates later) and offers `npm install` and `eds init` right away. Want a throwaway repo on GitHub instead? `eds sandbox new demo` creates one from the template.

`eds init` sets the project name, writes `fstab.yaml` only if your authoring model needs it, scaffolds the Universal Editor config for crosswalk projects and adds a local `.env` for `aem up`.

> 💡 Just type `eds` with no arguments to get an **interactive menu**. It stays open between actions: arrows to move, Enter to run, Esc to go back. Every command also works non-interactively with flags for CI.

---

## Step 1: Your first block, no Figma needed

The CLI ships with a sample design (the "Kiri Bloom" hero), read straight from disk. Start with a dry run. It needs no AI agent and only prints the prompt `eds` would send:

```bash
eds block from-design --sample --name hero --dry-run
```

Reading the prompt once is worth it. It tells the agent how EDS markup actually looks (rows > cells > content), how to write `decorate()`, which of the 17 Universal Editor field types to use per layer, and which of your project's design tokens (CSS custom properties) to reuse instead of hard-coding colours.

Now generate it for real:

```bash
eds block from-design --sample --name hero
```

You'll see a live log with per-phase timings, then a menu: **refine** (another pass with your feedback), **preview**, or **finish**. The result:

```
blocks/hero/
├── hero.js              # decorate(block)
├── hero.css             # scoped under .hero
├── _hero.json           # Universal Editor model (definitions / models / filters)
├── _hero.preview.html   # placeholder content in real EDS markup
└── .eds-meta.json       # design source, frame widths, prompt version
```

---

## Step 2: Use a real design

### Figma

Point it at a frame URL (right-click the frame → *Copy link to selection*):

```bash
eds figma setup     # one time: checks your agent has the Figma MCP server

eds block from-design \
  "https://www.figma.com/design/vwlEKTFhcrlwuA8dRgN5SD/Kiri-Bloom-AEM-EDS-Kit-Example?node-id=0-1" \
  --name hero
```

There are two ways in:

- **REST**: set `FIGMA_TOKEN` (a personal access token with `file_content:read`) and `eds` fetches the node itself, then embeds a compact spec in the prompt.
- **MCP**: without a token, the agent makes **one** `get_design_context` call, and the result is cached.

**Mind the limits.** Figma meters both paths, and the limit follows the **plan that owns the file**, not your seat elsewhere:

| | Starter | Professional | Organization | Enterprise |
|---|---|---|---|---|
| REST (Dev / Full seat) | 20 / month | 10 / min | 15 / min | 20 / min |
| MCP (Dev / Full seat) | 20 / month | 200 / day | 200 / day | 600 / day |
| View / Collab seat | 20 / month | 20 / month | 20 / month | 20 / month |

That's why `eds` spends **one call per block** and caches it, paces REST calls per minute even across parallel runs, waits out a short `Retry-After`, and **stops** with the reset time when you hit a plan cap. It never silently falls back to burning your MCP budget.

On a Starter file, the cheapest route is to **export the frame as PNG or SVG**. A local file uses no quota:

```bash
eds block from-design ./exports/hero.svg --name hero
```

### Framer or Google Stitch

Paste the page URL. `eds` detects the provider from the host:

```bash
npx playwright install chromium        # once, for the headless browser
eds block from-design "https://your-site.framer.website/" --name hero
```

Stitch projects sit behind a Google login. Pass `--auth` once: a real browser window opens, you log in by hand, the session is saved owner-only in `~/.eds/auth/`, and later scrapes reuse it.

```bash
eds block from-design "<stitch-url>" --name hero --auth
```

### Content Fragments

If the block should render a **Content Fragment** instead of document content:

```bash
eds block from-design "<figma-url>" --name product-teaser --source cf
```

You get an async `decorate()` that fetches the fragment, plus a UE model with an `aem-content-fragment` picker. `--source mixed` combines both.

---

## Step 3: Preview at the design's real widths

```bash
eds block preview hero        # one block
eds block preview             # a gallery of every block
```

No build step, and nothing is written to your project: the harness is served from memory. The width dropdown uses the **frame widths read from the design** (stored in `.eds-meta.json`), not a generic device list. Edits to the block live-reload in the browser.

When you want to see it in a real page, run your usual `aem up`. The block is just files in `blocks/`.

---

## Step 4: QA before anyone reviews it

Both checks render the block in headless Chromium and exit non-zero on failure, so you can put them in CI:

```bash
eds block test hero --update     # write baseline screenshots once
eds block test hero              # visual regression vs the baseline (default 1% threshold)
eds block test hero --design     # rendered block vs its Figma design image

eds block check hero             # alt text, image dimensions (CLS), accessible names, empty hrefs…
eds block check --strict         # all blocks, fail on warnings too
```

`eds block test` screenshots **the block element only**, not a 900px viewport of mostly white space, and writes diff images to `tmp/eds-cli/visual-diff/`.

`eds block check` also catches an easy-to-miss bug. If the preview mock nests content one `<div>` deeper than real EDS markup, a `decorate()` written against the mock will misread real authored content.

While you're at it:

```bash
eds doctor           # project audit: fstab, head.html, every block has JS + a UE model…
eds audit loading    # EDS loading-phase rules (eager / lazy / delayed)
eds audit security
```

---

## Step 5: Migrate a classic AEM component

This step needs no agent and no network. `eds migrate component` parses the component's dialog and maps its fields onto Universal Editor field types: selects keep their options, multifields become repeatable containers, and tabs are preserved.

```bash
eds migrate component ./ui.apps/src/main/content/jcr_root/apps/mysite/components/hero
```

It covers the setups you meet in real projects:

- **AEM as a Cloud Service proxy components** with no dialog of their own, just `sling:resourceSuperType` pointing at a Core Component. Point `--super-root` at a Core Components checkout and the parent's dialog is resolved, Granite `include`s too:

  ```bash
  git clone --depth 1 https://github.com/adobe/aem-core-wcm-components
  eds migrate component ./apps/wknd/components/teaser \
    --super-root ./aem-core-wcm-components/content/src/content/jcr_root
  ```

- **AEM 6.5 Classic UI** `dialog.xml` (ExtJS `xtype`s: `textfield`, `richtext`, `pathfield`, `selection`, `smartimage`, `multifield`, ACS `multifieldpanel`, `tabpanel`, `cqinclude`…).

- **Clientlib CSS** is pulled into the block's CSS when it can be found. `css.txt` ordering is honoured, and LESS/SCSS that needs a build is flagged.

You get `blocks/<name>/` with the UE model, a `decorate()` stub to port your HTL logic into, and the CSS. I tested it on **163 real components** from Core Components, WKND, We.Retail and ACS Commons.

---

## Bonus: keep it all local with Ollama or oMLX

Some clients don't want designs sent to a cloud model. `eds` can drive a local model instead:

```bash
ollama pull qwen2.5-coder:14b && ollama serve
eds block from-design "https://your-site.framer.website/" --name hero --agent ollama

# a PNG export needs a vision model
eds block from-design ./hero.png --name hero --agent ollama --model qwen2.5vl:7b

# Apple Silicon, via oMLX
eds block from-design ./hero.svg --name hero --agent omlx
```

A local model can't read files or call tools, so the CLI does the I/O. It sends the whole prompt, with the design embedded (an SVG inlined, a PNG attached as an image), and asks for files in a delimited format. Then it writes them itself, **and only inside `blocks/<name>/`**. A model that "helpfully" edits `scripts/scripts.js` gets rejected.

A design prompt is about 20–40k tokens. Ollama's default context is much smaller, so `eds` asks for 32k (configurable) and warns you when the prompt won't fit. Any OpenAI-compatible server works too: LM Studio, llama.cpp or vLLM, with `--agent local` and `local.baseUrl` in config.

```json
{ "agent": "ollama", "local": { "model": "qwen2.5-coder:14b", "contextTokens": 49152 } }
```

---

## Does it actually work?

I didn't want a demo that only works on one hand-picked hero, so the project has a public **[end-to-end test page](https://piotrgodycki.github.io/aem-eds-kit/e2e-example.html)**. The whole example screen, 11 blocks from header to footer, was generated from a scraped page and from Figma exports, then screenshotted next to the design at 1440px and 390px.

**The design:**

![Hero: the design](https://piotrgodycki.github.io/aem-eds-kit/e2e/hero-design.webp)

**The generated block, rendered:**

![Hero: the generated EDS block](https://piotrgodycki.github.io/aem-eds-kit/e2e/hero-stitch.webp)

It also has the 65-case CLI matrix and the AEM migration results. Every bug the tests found became a GitHub issue, fixed in its own PR, so you can see in the [changelog](https://piotrgodycki.github.io/aem-eds-kit/changelog.html) what broke and how it was fixed.

---

## Wrap-up

```bash
npm install -g aem-eds-kit@latest
cd your-eds-project
eds
```

- 📦 npm: [aem-eds-kit](https://www.npmjs.com/package/aem-eds-kit)
- 📖 Docs: [piotrgodycki.github.io/aem-eds-kit/docs.html](https://piotrgodycki.github.io/aem-eds-kit/docs.html)
- 💻 GitHub: [piotrgodycki/aem-eds-kit](https://github.com/piotrgodycki/aem-eds-kit) (MIT)

It's early, and I'd love feedback from people building EDS sites. What does your design-to-block workflow look like today, and what would you want a tool like this to handle? Let me know in the comments or [open an issue](https://github.com/piotrgodycki/aem-eds-kit/issues).

*aem-eds-kit is an independent open-source project, not affiliated with or endorsed by Adobe or Figma.*
