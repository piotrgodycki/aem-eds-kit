# aem-eds-kit example file (Figma)

A branded test file for `eds block from-design`, plus its HTML twin:

| | Where |
|---|---|
| Figma file | built by the plugin in this folder |
| HTML twin | [`site/example/`](../../site/example/) → <https://piotrgodycki.github.io/aem-eds-kit/example/> |

Both share the same tokens, copy and names: every Figma variable is a CSS custom
property (`color/brand` → `--color-brand`), every top-level Figma frame is a block
on the page, and Figma layer names are the HTML class names. So a block generated
from a Figma frame can be compared one-to-one with the reference page.

The file follows [`docs/figma-design-guidelines.md`](../../docs/figma-design-guidelines.md):
kebab-case block frames, Auto Layout everywhere, layers named by role, all colors /
spacing / radii / font sizes bound to Variables, text styles, lowercase variant
properties and component descriptions that list the Universal Editor fields.

## Build the file

1. Open **Figma desktop** and create a new design file.
2. **Plugins → Development → Import plugin from manifest…** and pick
   `examples/figma-kit/manifest.json` from this repo.
3. Run **Plugins → Development → aem-eds-kit example file**.

It takes a few seconds and creates five pages:

| Page | Contents |
|---|---|
| Cover | What the file is and how to use it |
| Tokens | Color swatches and the type scale, bound to the variables |
| Components | `logo` (Theme=light/dark), `button` (Style=primary/secondary/secondary-dark/dark, `label` text property), `card` (title / description / link text properties, *Has image* and *Show link* booleans) |
| Blocks | One component per EDS block (below) |
| Home | `home-desktop`: the page assembled from block instances, same order as the HTML twin |

Re-running is safe: variables and text styles are reused, and only the nodes the
plugin created before are replaced.

Images are loaded from the deployed example page (`/aem-eds-kit/example/img/`),
so the plugin needs a network connection. Without one, it puts grey placeholders
in their place and says so when it finishes. Fonts are Geist and Geist Mono (Google
Fonts in Figma). If they're missing, the plugin uses Inter and Roboto Mono.

## Blocks

| Frame | Variants | Content / UE fields |
|---|---|---|
| `header` | - | logo, nav (4 links), header-actions |
| `hero` | Layout=split\|centered, Theme=dark\|light | eyebrow, headline, description, cta-group, hero-image (split) |
| `stats` | - | 4 × stat (stat-value, stat-label) |
| `cards` | - | section-header + card-list (3 × card) |
| `columns` | - | column-text (eyebrow, headline, description, feature-list) + column-image |
| `teaser` | Layout=image-left\|image-right | teaser-image, eyebrow, headline, description, cta |
| `tabs` | - | tab-list (3 tabs, tab-active) + tab-panel (panel-text, panel-code) |
| `accordion` | - | section-header + accordion-list (question, answer) |
| `quote` | - | quote-text, author-name, author-role |
| `cta-banner` | Theme=brand\|dark | headline, description, cta |
| `footer` | - | footer-brand, 3 × footer-column, footer-bottom |

All frames are 1440 px wide (120 px gutters, 1200 px content).

## Test a block

```sh
# in an EDS project - right-click a frame on the Blocks page → Copy link to selection
eds block from-design "https://www.figma.com/design/<file>/<name>?node-id=<frame>"
eds block preview hero
```

Then compare the preview with the same block on the HTML twin. A full run of all
11 blocks, with screenshots next to the design, is on the site:
[End-to-end test](https://piotrgodycki.github.io/aem-eds-kit/e2e-example.html). For the quota-free path,
export a frame as PNG/SVG and pass the file instead of the link.

## Changing the file

Tokens and copy are at the top of [`code.js`](code.js) (`COLORS`, `NUMBERS`,
`TEXT_STYLES`) and in each `build*` function. Mirror any change in
`site/example/example.css` / `index.html` so the two stay in sync.
