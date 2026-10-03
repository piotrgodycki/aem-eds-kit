export default function decorate(block) {
	const h1 = block.querySelector("h1");
	if (h1) h1.classList.add("hero-title");
}
