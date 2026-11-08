# aem-eds-kit: working rules

Read `CODING_STANDARDS.md` before changing anything. The short version:

- **One issue, one branch, one PR.** Open a GitHub issue `EDS-NNN: …` (NNN = the issue number), work on `feature/EDS-NNN` or `bug/EDS-NNN`, open a PR with `Fixes #NNN` and merge it (merge commit) once CI is green.
- **Every change updates the docs in the same PR:** `CHANGELOG.md`, `README.md` (also the npm page) and the site (`site/docs.html`, `site/index.html`, the guides). CI's docs gate (`scripts/check-docs.mjs`) fails a PR that changes `src/` without a changelog entry, or the CLI surface (`src/bin/eds.ts`) without README and `docs.html`.
- **Checks before pushing:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. After changing a page under `site/`, run `node scripts/site-changelog.mjs` and check it at 1280 and 390px.
- The pre-commit hook bumps the patch version when `src/` changes; that's expected.
- **Releases are automatic.** A merge to `main` that brings a new version publishes it (`.github/workflows/publish.yml`): npm, GitHub Packages, the CHANGELOG's Unreleased moved under the version, the tag and the GitHub release. Nobody runs `npm publish` by hand.
- Commits carry no `Co-Authored-By` trailer.
