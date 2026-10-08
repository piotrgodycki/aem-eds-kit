# AI-First Design Rules for EDS Blocks

Rules for designers creating Figma designs that AI agents will translate into AEM Edge Delivery Services blocks.

AI reads your layer names, structure, tokens, and annotations - then generates production code from them. These rules ensure the AI produces clean, semantic, responsive blocks on the first attempt.

---

## How the pipeline works

```
Figma frame → eds-cli → AI agent + Figma MCP → EDS block (JS + CSS)
```

The AI agent reads your Figma design via MCP and generates a block. It sees:
- Layer names and hierarchy
- Auto Layout properties
- Design tokens (variables)
- Component structure
- Text content
- Image fills
- Annotations and descriptions

**Everything you name and structure in Figma directly influences the generated code.**

---

## Frame & layer naming

### Use semantic, descriptive names

The agent maps layer names to HTML elements and CSS classes.

| Instead of | Use |
|---|---|
| `Frame 427` | `hero-banner` |
| `Rectangle 12` | `card-background` |
| `Group 3` | `feature-list` |
| `Text` | `headline`, `description`, `cta-label` |
| `Image` | `hero-image`, `author-avatar` |

### Use kebab-case for block-level frames

The top-level frame name becomes the block name. Keep it in kebab-case:
- `hero-banner` → `blocks/hero-banner/`
- `card-list` → `blocks/card-list/`
- `testimonial-carousel` → `blocks/testimonial-carousel/`

### Name layers by role, not appearance

| Instead of | Use |
|---|---|
| `big-red-text` | `headline` |
| `gray-box` | `sidebar` |
| `small-italic` | `caption` |

---

## Structure & Auto Layout

### Use Auto Layout everywhere

Auto Layout maps directly to CSS Flexbox/Grid. Frames without Auto Layout produce absolute positioning - fragile and not responsive.

- Wrap related elements in Auto Layout frames
- Set spacing, padding, and alignment in Figma - the agent reads these values
- Use `Fill container` and `Hug contents` for sizing - they map to `flex-grow` and `auto` width

### Maintain a clear hierarchy

EDS blocks follow a flat, semantic structure. Design your layers to reflect this:

```
hero-banner              ← block root
  ├── content            ← text container
  │   ├── headline       ← <h1>
  │   ├── description    ← <p>
  │   └── cta            ← <a> button
  └── hero-image         ← <picture>
```

Avoid deeply nested groups without clear meaning. The agent will try to flatten unnecessary wrappers.

### One frame = one block

Each EDS block should be a single top-level frame (or component). Don't combine multiple blocks into one frame.

---

## Design tokens & variables

### Use Figma Variables for all values

The agent calls `get_variable_defs` to read your variables and map them to CSS custom properties.

Define variables for:
- **Colors**: `color/brand`, `color/text`, `color/background`, `color/accent`
- **Spacing**: `spacing/s`, `spacing/m`, `spacing/l`, `spacing/xl`
- **Typography**: `font-size/body`, `font-size/heading-1`, `line-height/body`
- **Border radius**: `radius/s`, `radius/m`, `radius/pill`

### Use slash-separated naming

Figma variables with `/` separators map cleanly to CSS custom properties:

| Figma variable | CSS output |
|---|---|
| `color/brand` | `--color-brand` |
| `spacing/m` | `--spacing-m` |
| `font-size/heading-1` | `--font-size-heading-1` |

### Apply variables to layers, don't hardcode

The agent can only detect tokens if you **bind** variables to fills, strokes, spacing, etc. Hex values typed directly are treated as one-off values.

### Support light/dark modes

If your project uses themes, create variable modes in Figma (`light`, `dark`). The agent will generate CSS that respects `prefers-color-scheme` or class-based theming.

---

## Typography

### Use consistent text styles

Define text styles in Figma and apply them to all text layers. This helps the agent map to the correct heading levels and body text:

| Text style name | Maps to |
|---|---|
| `Heading 1` / `Display` | `<h1>` |
| `Heading 2` | `<h2>` |
| `Heading 3` | `<h3>` |
| `Body` / `Paragraph` | `<p>` |
| `Caption` / `Small` | `<small>` or `<p class="caption">` |
| `Label` | `<span>` or label element |
| `Link` | `<a>` |

### Keep text layers editable

Don't outline text - the agent needs actual text content to generate semantic HTML. Real text in Figma = real content in the block's document markup.

---

## Images & media

### Name image layers descriptively

The layer name hints at the `alt` attribute:

| Layer name | Generated alt |
|---|---|
| `hero-image` | Inferred from context or left for developer |
| `product-photo-laptop` | `"Laptop product photo"` |
| `decorative-background` | `alt=""` (decorative) |
| `icon-checkmark` | `"Checkmark"` |

### Mark decorative images

If an image is purely decorative (backgrounds, dividers, abstract shapes), name it with a `decorative-` prefix or add a description note. This tells the agent to use an empty `alt=""`.

### Provide export settings

For images that should be exported as assets, add export settings in Figma (1x, 2x). This signals the agent to use `<picture>` with responsive `srcset`.

---

## Components & variants

### Build blocks as components

Wrap your block design as a Figma component. This allows:
- The agent to recognize it as a reusable unit
- Variant props to map to block variations (e.g., `hero (dark)`, `hero (centered)`)
- Code Connect to link the Figma component to the generated EDS block

### Use variant properties for block variations

EDS blocks support variations via CSS classes. Design your component with variant properties:

| Figma variant property | EDS output |
|---|---|
| `Layout=centered` | `.hero-banner.centered` |
| `Theme=dark` | `.hero-banner.dark` |
| `Size=large` | `.hero-banner.large` |

Name variant properties in lowercase. The agent will map them to CSS modifier classes.

### Use boolean properties for optional elements

| Figma property | Behavior |
|---|---|
| `Show CTA=true/false` | Agent generates conditional rendering |
| `Has Image=true/false` | Block handles missing image gracefully |

---

## Responsive design

### Design at 3 breakpoints

Provide frames or variants at these widths (matching EDS conventions):

| Breakpoint | Width | Name |
|---|---|---|
| Mobile | 375px | `hero-banner/mobile` |
| Tablet | 768px | `hero-banner/tablet` |
| Desktop | 1440px | `hero-banner/desktop` |

If you only design one breakpoint, make it desktop - the agent will infer mobile-first scaling. But providing mobile helps a lot.

### Use constraints and resizing

Set proper constraints on layers (left+right, center, scale). These help the agent understand which elements are fluid vs. fixed.

---

## Annotations & handoff notes

### Use Figma annotations

Add annotations (via the built-in annotation tool or Dev Mode notes) for:
- **Interaction behavior**: "This carousel auto-plays every 5s", "Accordion collapsed by default"
- **Loading strategy**: "Hero image should load eagerly", "This section loads on scroll"
- **Content rules**: "Max 3 cards", "Heading truncates at 2 lines"
- **Accessibility notes**: "Tab navigation order: CTA → secondary link", "Announce slide changes to screen readers"

The agent reads annotations from `get_design_context` and follows them.

### Add component descriptions

In Figma's component panel, write a description for each block component:

> "Hero banner for landing pages. Supports dark/light theme. CTA button is optional. Image should be 16:9 ratio, loads eagerly."

This description appears in the agent's design context and guides code generation.

---

## Checklist before handoff

Before sharing a Figma URL with `eds block from-design`:

- [ ] Top-level frame uses kebab-case name matching the desired block name
- [ ] All layers have semantic names (no `Frame 123`, `Group 4`)
- [ ] Auto Layout is used for all layout containers
- [ ] Colors, spacing, and typography use Figma Variables (not hardcoded)
- [ ] Text layers use text styles with heading-level names
- [ ] Images have descriptive names (or `decorative-` prefix)
- [ ] Component has a description explaining behavior
- [ ] Responsive variants or breakpoint frames are provided (at least desktop)
- [ ] Interaction notes are added as annotations
- [ ] Unnecessary hidden layers are removed (they add noise to the agent's context)

---

## Example: well-structured vs. poorly-structured

### Poorly structured (hard for agent)

```
Frame 892
  ├── Group 12
  │   ├── Rectangle 4          ← background? border? unknown
  │   ├── Untitled             ← what text is this?
  │   └── Frame 201
  │       └── Text 2           ← heading? label?
  └── Group 14
      └── image.png            ← decorative? content?
```

### Well structured (easy for agent)

```
hero-banner
  ├── content
  │   ├── eyebrow              ← <p class="eyebrow">
  │   ├── headline             ← <h1>
  │   ├── description          ← <p>
  │   └── cta-button           ← <a class="button">
  └── hero-image               ← <picture>
```

The second structure produces clean, semantic HTML with proper classes on the first generation attempt.
