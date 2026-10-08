/**
 * Reusable Universal Editor field groups ("partials"). UE models are flat field
 * arrays with no native includes, so these compose at generation time - inlined
 * into a model. Patterns mirror the common Adobe EDS / Core Component shapes
 * (title, image, button, teaser, card, embed, section styles, ...).
 *
 * Every partial takes an optional `prefix` so the same group can appear more
 * than once in a model without name clashes (e.g. a primary + secondary CTA).
 */

import { type Field, type Option, f, n } from "./helpers.js";

const HEADING_LEVELS: Option[] = [
	{ name: "H1", value: "h1" },
	{ name: "H2", value: "h2" },
	{ name: "H3", value: "h3" },
	{ name: "H4", value: "h4" },
	{ name: "H5", value: "h5" },
	{ name: "H6", value: "h6" },
];

const LINK_TARGETS: Option[] = [
	{ name: "Same tab", value: "_self" },
	{ name: "New tab", value: "_blank" },
];

const BUTTON_STYLES: Option[] = [
	{ name: "Default", value: "" },
	{ name: "Primary", value: "primary" },
	{ name: "Secondary", value: "secondary" },
];

const SECTION_STYLES: Option[] = [
	{ name: "Highlight", value: "highlight" },
	{ name: "Dark", value: "dark" },
	{ name: "Centered", value: "centered" },
	{ name: "Full width", value: "full-width" },
];

/** title + heading level (semantic: `title` / `titleType`). */
export const heading = (p = ""): Field[] => [
	f.text(n(p, "title"), "Title"),
	f.select(n(p, "titleType"), "Heading level", HEADING_LEVELS, "h2"),
];

/** A small line above the title. */
export const eyebrow = (p = ""): Field[] => [f.text(n(p, "eyebrow"), "Eyebrow")];

/** image + alt (semantic: `image` / `imageAlt`). */
export const image = (p = ""): Field[] => [
	f.reference(n(p, "image"), "Image"),
	f.text(n(p, "imageAlt"), "Alt text"),
];

/** rich-text body. */
export const richtext = (p = ""): Field[] => [f.richtext(n(p, "text"), "Text")];

/** link text + destination + target. */
export const link = (p = ""): Field[] => [
	f.text(n(p, "linkText"), "Link text"),
	f.aemContent(n(p, "link"), "Link"),
	f.select(n(p, "linkTarget"), "Open in", LINK_TARGETS, "_self"),
];

/** A CTA: link + button style. */
export const cta = (p = ""): Field[] => [
	...link(p),
	f.select(n(p, "ctaStyle"), "Style", BUTTON_STYLES, ""),
];

/** Alias of {@link cta}. */
export const button = cta;

/** A repeatable list of CTAs (multifield). */
export const ctaGroup = (p = ""): Field[] => [
	f.container(n(p, "ctas") || "ctas", "Buttons", cta()),
];

/** Section-level CSS modifier classes (multiselect). */
export const classes = (p = ""): Field[] => [
	f.multiselect(n(p, "classes"), "Styles", SECTION_STYLES),
];

/** An embed / video by URL. */
export const embed = (p = ""): Field[] => [f.aemContent(n(p, "url"), "URL (video / embed)")];

/** Core-Components-style teaser: image + eyebrow + title + text + CTA. */
export const teaser = (p = ""): Field[] => [
	...image(p),
	...eyebrow(p),
	...heading(p),
	...richtext(p),
	...cta(p),
];

/** A card: image + title + description + link. */
export const card = (p = ""): Field[] => [
	...image(p),
	f.text(n(p, "title"), "Title"),
	f.richtext(n(p, "description"), "Description"),
	...link(p),
];

export interface Partial {
	id: string;
	label: string;
	build: (prefix?: string) => Field[];
}

export const PARTIALS: Partial[] = [
	{ id: "heading", label: "Heading (title + level)", build: heading },
	{ id: "eyebrow", label: "Eyebrow (kicker line)", build: eyebrow },
	{ id: "image", label: "Image (reference + alt)", build: image },
	{ id: "richtext", label: "Rich text body", build: richtext },
	{ id: "link", label: "Link (text + url + target)", build: link },
	{ id: "cta", label: "CTA (link + style)", build: cta },
	{ id: "cta-group", label: "CTA group (repeatable buttons)", build: ctaGroup },
	{ id: "classes", label: "Section styles (CSS modifiers)", build: classes },
	{ id: "embed", label: "Embed / video (URL)", build: embed },
	{ id: "teaser", label: "Teaser (image + eyebrow + title + text + CTA)", build: teaser },
	{ id: "card", label: "Card (image + title + description + link)", build: card },
];

export function partialById(id: string): Partial | undefined {
	return PARTIALS.find((p) => p.id === id);
}
