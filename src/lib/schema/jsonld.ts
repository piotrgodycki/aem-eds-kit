/**
 * Generate JSON-LD (schema.org structured data) for an EDS block. The snippet
 * is injected into the block's `decorate()` and appends a
 * `<script type="application/ld+json">` to the document head, built from the
 * block's content. Deterministic source rewrite, idempotent.
 *
 * Snippets reference the block element as `root` (aliased from the real
 * decorate parameter) so they don't depend on its name.
 */

export const SCHEMA_MARKER = "json-ld (eds schema";

export interface SchemaType {
	id: string;
	label: string;
	/** JS object-literal expression for the structured data; may read `root`. */
	object: string;
}

export const SCHEMA_TYPES: SchemaType[] = [
	{
		id: "Article",
		label: "Article / BlogPosting",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: root.querySelector('h1, h2, h3')?.textContent?.trim() || document.title,
      image: [...root.querySelectorAll('img')].map((img) => img.src),
      description: root.querySelector('p')?.textContent?.trim(),
      url: window.location.href,
      // TODO: author, datePublished, dateModified
    }`,
	},
	{
		id: "FAQPage",
		label: "FAQ page",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [...root.children].map((row) => {
        const [q, a] = row.children;
        return {
          '@type': 'Question',
          name: q?.textContent?.trim(),
          acceptedAnswer: { '@type': 'Answer', text: a?.innerHTML?.trim() },
        };
      }),
    }`,
	},
	{
		id: "BreadcrumbList",
		label: "Breadcrumb list",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [...root.querySelectorAll('a')].map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: a.textContent?.trim(),
        item: a.href,
      })),
    }`,
	},
	{
		id: "Product",
		label: "Product",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim(),
      image: [...root.querySelectorAll('img')].map((img) => img.src),
      description: root.querySelector('p')?.textContent?.trim(),
      // TODO: brand, sku, offers { '@type': 'Offer', price, priceCurrency, availability }
    }`,
	},
	{
		id: "Organization",
		label: "Organization",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: document.title,
      url: window.location.origin,
      logo: root.querySelector('img')?.src,
      // TODO: sameAs: [social profile URLs], contactPoint
    }`,
	},
	{
		id: "LocalBusiness",
		label: "Local business",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim() || document.title,
      image: root.querySelector('img')?.src,
      url: window.location.origin,
      // TODO: address (PostalAddress), telephone, openingHours, geo
    }`,
	},
	{
		id: "Event",
		label: "Event",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim(),
      image: [...root.querySelectorAll('img')].map((img) => img.src),
      url: window.location.href,
      // TODO: startDate, endDate, location (Place), offers
    }`,
	},
	{
		id: "VideoObject",
		label: "Video",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim() || document.title,
      thumbnailUrl: root.querySelector('img')?.src,
      contentUrl: root.querySelector('a[href], video source[src]')?.href,
      // TODO: description, uploadDate, duration (ISO 8601)
    }`,
	},
	{
		id: "Recipe",
		label: "Recipe",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim(),
      image: [...root.querySelectorAll('img')].map((img) => img.src),
      recipeIngredient: [...root.querySelectorAll('li')].map((li) => li.textContent?.trim()),
      // TODO: recipeInstructions, prepTime, cookTime, nutrition
    }`,
	},
	{
		id: "HowTo",
		label: "How-to",
		object: `{
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: root.querySelector('h1, h2, h3')?.textContent?.trim(),
      step: [...root.querySelectorAll('li')].map((li, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        text: li.textContent?.trim(),
      })),
    }`,
	},
];

export function schemaTypeById(id: string): SchemaType | undefined {
	return SCHEMA_TYPES.find((t) => t.id.toLowerCase() === id.toLowerCase());
}

export interface InjectResult {
	js: string;
	changed: boolean;
	reason?: string;
}

/** Inject a JSON-LD builder at the top of the block's `decorate()`. Idempotent. */
export function injectJsonLd(js: string, type: SchemaType): InjectResult {
	if (js.includes(SCHEMA_MARKER)) return { js, changed: false, reason: "already has JSON-LD" };

	const decorate = js.match(
		/export default (?:async )?function decorate\s*\(\s*([A-Za-z_$][\w$]*)?[^)]*\)\s*\{/,
	);
	if (!decorate || decorate.index === undefined) {
		return { js, changed: false, reason: "no `export default function decorate(...)` found" };
	}
	const param = decorate[1] || "block";
	const at = decorate.index + decorate[0].length;
	const snippet = `
  // --- ${SCHEMA_MARKER}: ${type.id}) ---
  {
    const root = ${param};
    const ld = ${type.object};
    const ldScript = document.createElement('script');
    ldScript.type = 'application/ld+json';
    ldScript.textContent = JSON.stringify(ld);
    document.head.append(ldScript);
  }
`;
	return { js: `${js.slice(0, at)}${snippet}${js.slice(at)}`, changed: true };
}
