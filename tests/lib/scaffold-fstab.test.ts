import { describe, expect, it } from "vitest";
import { daMountpoint, fstabYaml, needsFstab, pathsJson } from "../../src/lib/scaffold/fstab.js";

describe("fstab / authoring helpers", () => {
	it("only document models need an fstab", () => {
		expect(needsFstab("ue")).toBe(false);
		expect(needsFstab("da")).toBe(true);
		expect(needsFstab("gdrive")).toBe(true);
		expect(needsFstab("sharepoint")).toBe(true);
	});

	it("builds the DA mountpoint from org/site", () => {
		expect(daMountpoint("my-org", "my-site")).toBe("https://content.da.live/my-org/my-site/");
	});

	it("renders a mountpoint into fstab yaml", () => {
		expect(fstabYaml("https://content.da.live/o/s/")).toBe(
			"mountpoints:\n  /: https://content.da.live/o/s/\n",
		);
	});

	it("builds a crosswalk paths.json for the site", () => {
		const parsed = JSON.parse(pathsJson("acme"));
		expect(parsed.mappings).toContain("/content/acme/:/");
		expect(parsed.includes).toContain("/content/acme/");
	});
});
