# aem-eds-kit: working rules

Read `CODING_STANDARDS.md` before changing anything. The short version:

- **One issue, one branch, one PR.** Open a GitHub issue `EDS-NNN: …` (NNN = the issue number), work on `feature/EDS-NNN` or `bug/EDS-NNN`, open a PR with `Fixes #NNN` and merge it (merge commit) once CI is green.
- **Every change updates the docs in the same PR:** `CHANGELOG.md`, `README.md` (also the npm page) and the site (`site/docs.html`, `site/index.html`, the guides). CI's docs gate (`scripts/check-docs.mjs`) fails a PR that changes `src/` without a changelog entry, or the CLI surface (`src/bin/eds.ts`) without README and `docs.html`.
- **Propose before building.** For a change asked for in chat, first show it (a mockup, a screenshot, or the text), ask, and build only after a yes. Bugs with one obvious fix are the exception.
- **Everything in the repository is in English:** code, CLI messages, docs, the site, commits, issues and pull requests, whatever language the request was in.
- **Never delete branches and never force-push.** Bring `main` into a branch with a merge commit.
- **Examples use the kit's own names:** branches `feature/EDS-1`, `bug/EDS-2`; never a client's project.
- **Plain punctuation in what users read:** full stops and commas, no semicolons.
- **Leave the code cleaner than you found it.** A change removes what it makes unused (functions, files, styles, flags, dependencies) instead of leaving it behind. Comments say *why*, in a sentence or two; drop ones that repeat the code. Write for the next developer: plain names, small functions, no clever tricks, so someone new can follow it without a tour.
- **Checks before pushing:** `pnpm run lint`, `pnpm run knip`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`. After changing a page under `site/`, run `node scripts/site-changelog.mjs` and check it at 1280 and 390px.
- The kit is developed with pnpm (`pnpm-lock.yaml`); only the Publish workflow uses `npm publish`.
- The pre-commit hook bumps the patch version when `src/` changes; that's expected.
- **Releases are automatic.** A merge to `main` that brings a new version publishes it (`.github/workflows/publish.yml`): npm, GitHub Packages, the CHANGELOG's Unreleased moved under the version, the tag and the GitHub release. Nobody runs `npm publish` by hand.
- **No em dashes** in anything written (CLI messages, docs, site, comments, commits); `pnpm run lint` checks.
- Commits carry no `Co-Authored-By` trailer.
