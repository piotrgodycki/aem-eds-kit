# Launch kit — aem-eds-kit

Draft copy for launching `aem-eds-kit`. One hero promise: **paste a design, get a
production-ready EDS block.** Lead with `eds block from-design`; everything else is
"batteries included."

Official try-it design: **Kiri Bloom AEM EDS Kit Example** —
https://www.figma.com/design/vwlEKTFhcrlwuA8dRgN5SD/Kiri-Bloom-AEM-EDS-Kit-Example?node-id=0-1

Zero-setup try-it (no Figma, no token): `eds block from-design --sample --name hero`.

---

## 60-second Loom script

**Goal:** from a design to a live, authorable EDS block — on screen, in one take.
**Setup before recording:** terminal in an EDS project (or `eds sandbox new demo`),
browser ready, the Kiri Bloom Figma tab open. Keep it to ~60s.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:06 | Figma: Kiri Bloom hero frame | "This is a Figma hero. Normally, turning it into an Edge Delivery block is an afternoon of hand-coding." |
| 0:06–0:12 | Terminal, type `eds block from-design` | "With aem-eds-kit, it's one command. Paste the Figma link —" |
| 0:12–0:22 | Wizard steps flash by (name: hero, content: Universal Editor, UE model: yes) | "— answer a few questions: name it, pick where the content comes from, generate the Universal Editor model." |
| 0:22–0:34 | Live log streaming: get_design_context → writing hero.css / hero.js / _hero.json | "It reads the design once through MCP, then your own AI agent writes the code — JS, CSS, and the Universal Editor model — straight into your repo." |
| 0:34–0:44 | `eds block preview hero` → browser, width switcher | "Preview it live at the real design widths. No build step." |
| 0:44–0:54 | Toggle breakpoints; show it's editable in UE | "It's responsive, it's scoped, and it's authorable in the Universal Editor out of the box." |
| 0:54–1:00 | Terminal: `npm i -g aem-eds-kit` | "npm install -g aem-eds-kit. Design in, EDS block out. Link's below." |

**No Figma account? Zero-setup variant for 0:06–0:22:** type
`eds block from-design --sample --name hero` — ships a bundled Kiri Bloom design,
read from disk. No token, no MCP, no network.

---

## Launch post — Show HN

**Title:** Show HN: aem-eds-kit – turn a Figma design into an AEM Edge Delivery block

Hi HN. I build on Adobe's Edge Delivery Services (the "Franklin/Helix" stack), where
every component is a "block" — vanilla JS + CSS, no framework. Going from a design to a
block is repetitive, hand-coded work.

`aem-eds-kit` is a CLI (`eds`) that closes that gap. You paste a design link — Figma,
Stitch, Canva, Sketch, Framer — and it hands the design to the AI agent you already run
(Claude Code, Cursor, Codex) over MCP. The agent writes the block's JS, CSS, and a
Universal Editor model straight into your repo. Then `eds block preview` serves it live
at the real design breakpoints.

It's a dev tool — it runs on your machine and ships nothing to your site. It also
scaffolds blocks, migrates classic AEM components, and runs a few QA passes
(visual-regression, content/a11y, loading + security audits) you can wire into CI.

Try it with zero setup (no Figma account, no token):

    npm i -g aem-eds-kit
    eds block from-design --sample --name hero
    eds block preview hero

Or point it at the official training file, the Kiri Bloom AEM EDS Kit example in Figma.

Design decisions I'd love feedback on: it fetches the design once into a cached
snapshot (so retries never re-fetch), defaults to the fastest model with a
human-in-the-loop refine step instead of an agent self-verify loop, and uses the Figma
REST API when you set a token to avoid the metered MCP tool-call limit.

Repo + docs in the first comment.

---

## Launch post — LinkedIn / X

Turning a Figma design into an AEM Edge Delivery block is an afternoon of hand-coding.
I made it one command.

`aem-eds-kit` → paste a design link, your AI agent writes the block — JS, CSS, and the
Universal Editor model — into your repo. Preview it live at the real breakpoints.

Try it with zero setup:
  npm i -g aem-eds-kit
  eds block from-design --sample --name hero
  eds block preview hero

No Figma token, no MCP call — it ships with the Kiri Bloom sample design. Point it at
real Figma when you're ready.

Design in. EDS block out. 🌱
Links 👇

---

## Launch post — AEM EDS community (Slack / Discord)

Hey all — sharing a CLI I've been building for EDS block work: **aem-eds-kit** (`eds`).

`eds block from-design <figma-url>` builds a block (JS + CSS + UE model) by handing the
design to your AI agent over MCP — one `get_design_context` call, cached, so it's easy
on the Figma MCP limit (set a token and it uses REST instead). It sits next to
`@adobe/aem-cli` and handles everything around the block: scaffolding, classic-AEM
component migration, a width-honest preview gallery, and QA (`eds block test` visual
regression, `eds block check` content/a11y, `eds audit loading|security`).

Zero-setup try (no token): `eds block from-design --sample --name hero` uses a bundled
Kiri Bloom design. There's also the official Kiri Bloom AEM EDS Kit example in Figma to
try the full path.

Feedback very welcome — especially on the UE model mapping and the content-source
options (Document Authoring / UE / Content Fragment).
