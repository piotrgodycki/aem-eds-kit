import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, no types
import { notes, release } from "../../scripts/changelog-release.mjs";

const before = `# Changelog

## [Unreleased]

### Added
- **\`eds agents\`** (EDS-105).

## [0.4.60] - 2026-11-06

### Changed
- **Illustrations** (EDS-077).

[Unreleased]: https://github.com/piotrgodycki/aem-eds-kit/commits/main
[0.4.60]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.60
`;

describe("Publish workflow: CHANGELOG", () => {
	it("releases Unreleased as the published version, with its npm link", () => {
		const out = release(before, "0.4.63", "2026-11-08");
		expect(out).toContain("## [Unreleased]\n\n## [0.4.63] - 2026-11-08\n\n### Added");
		expect(out).toContain(
			"[Unreleased]: https://github.com/piotrgodycki/aem-eds-kit/commits/main\n[0.4.63]: https://www.npmjs.com/package/aem-eds-kit/v/0.4.63\n[0.4.60]:",
		);
		expect(notes(out, "0.4.63")).toBe("### Added\n- **`eds agents`** (EDS-105).");
		expect(notes(out, "0.4.60")).toBe("### Changed\n- **Illustrations** (EDS-077).");
	});

	it("leaves the file alone when there is nothing new or the version is already there", () => {
		const once = release(before, "0.4.63", "2026-11-08");
		expect(release(once, "0.4.64", "2026-11-09")).toBe(once);
		expect(release(once, "0.4.63", "2026-11-09")).toBe(once);
	});
});
