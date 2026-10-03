// EDS block: hero-banner
// Full-width hero with background image, heading, description, and CTA
export default function decorate(block) {
	const rows = [...block.children];
	if (!rows.length) return;

	// First row: background image
	const imageRow = rows[0];
	const picture = imageRow.querySelector("picture");
	if (picture) {
		picture.classList.add("hero-banner-bg");
		// Eager load for above-fold hero image
		const img = picture.querySelector("img");
		if (img) {
			img.setAttribute("loading", "eager");
			img.setAttribute("fetchpriority", "high");
		}
		block.prepend(picture);
	}
	imageRow.remove();

	// Second row: text content (heading, description, CTA)
	const contentRow = rows[1];
	if (contentRow) {
		const contentWrapper = document.createElement("div");
		contentWrapper.classList.add("hero-banner-content");
		contentWrapper.innerHTML = contentRow.innerHTML;
		block.append(contentWrapper);
		contentRow.remove();

		// Add classes to content elements
		const heading = contentWrapper.querySelector("h1, h2");
		if (heading) heading.classList.add("hero-banner-title");

		const paragraphs = contentWrapper.querySelectorAll("p");
		paragraphs.forEach((p) => {
			const link = p.querySelector("a");
			if (link) {
				// Wrap CTA link in a styled container
				link.classList.add("hero-banner-cta");
				p.classList.add("hero-banner-cta-wrapper");
			} else if (p.textContent.trim()) {
				p.classList.add("hero-banner-description");
			}
		});
	}

	// Remove any remaining rows
	rows.slice(2).forEach((row) => row.remove());
}
