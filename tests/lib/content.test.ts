import { describe, expect, it } from "vitest";
import { buildContentPrompt, changedSections, parseContentAnswer } from "../../src/lib/content.js";

const page = (hero: string) =>
	`<body><header></header><main><div><div class="hero"><div><div><h1>${hero}</h1></div></div></div></div><div><p>About us &amp; more</p><div class="cards"><div><div>One</div></div></div></div></main><footer></footer></body>`;

describe("content changes", () => {
	it("finds the sections whose words differ, blocks named", () => {
		expect(changedSections(page("Spring sale"), page("Winter sale"))).toEqual([
			{ section: 1, before: "[hero] Spring sale", after: "[hero] Winter sale" },
		]);
		expect(changedSections(page("Same"), page("Same"))).toEqual([]);
	});

	it("decodes entities once, so an escaped entity stays as written", () => {
		const a = "<main><div><p>Fish &amp;lt;chips&amp;gt;</p></div></main>";
		const b = "<main><div><p>Fish &amp; chips</p></div></main>";
		expect(changedSections(a, b)).toEqual([
			{ section: 1, before: "Fish &lt;chips&gt;", after: "Fish & chips" },
		]);
	});

	it("shows an added section with an empty before", () => {
		const added = page("A").replace("</main>", "<div><p>New part</p></div></main>");
		expect(changedSections(page("A"), added)).toEqual([
			{ section: 3, before: "", after: "New part" },
		]);
	});

	it("asks for the whole document back and reads it from the answer", () => {
		const prompt = buildContentPrompt("/products", page("A"), "Make the title Winter sale");
		expect(prompt).toContain("The person asks: Make the title Winter sale");
		expect(prompt).toContain("Change only what the person asks.");
		expect(parseContentAnswer(`I changed the title.\n\n\`\`\`html\n${page("B")}\n\`\`\``)).toEqual({
			note: "I changed the title.",
			html: page("B"),
		});
		expect(parseContentAnswer("No fence here")).toBeNull();
	});
});
