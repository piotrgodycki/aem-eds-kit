import { describe, expect, it } from "vitest";
import {
	BOILERPLATES,
	SANDBOX_TOPIC,
	createArgs,
	previewUrl,
} from "../../src/lib/sandbox/github.js";

describe("sandbox github helpers", () => {
	it("builds the Edge Delivery preview URL", () => {
		expect(previewUrl("acme", "my-sandbox")).toBe("https://main--my-sandbox--acme.aem.page/");
		expect(previewUrl("acme", "s", "dev")).toBe("https://dev--s--acme.aem.page/");
	});

	it("builds gh repo create args (public + clone by default)", () => {
		expect(createArgs("acme/s", { template: BOILERPLATES.document, clone: true })).toEqual([
			"repo",
			"create",
			"acme/s",
			"--template",
			"adobe/aem-boilerplate",
			"--public",
			"--clone",
		]);
	});

	it("supports private and omitting clone", () => {
		const args = createArgs("s", { template: BOILERPLATES.ue, private: true });
		expect(args).toContain("--private");
		expect(args).not.toContain("--clone");
		expect(args).toContain("adobe/aem-boilerplate-xwalk");
	});

	it("exposes the sandbox topic", () => {
		expect(SANDBOX_TOPIC).toBe("eds-sandbox");
	});
});
