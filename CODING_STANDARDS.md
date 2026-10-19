# Coding Standards & Agent Retro Log

A living log of **every meaningful thing the agent got wrong** on this project,
distilled into rules so the same mistake isn't repeated.

Method (Matt Pocock's "retro"): after a working session, look back over the
conversation for the moments where the **user had to correct course** — a
rejected tool call, a "no, do it this way", a one-line answer that bypassed the
agent's plan. For each, write one concise, generalizable rule. No fluff, no
rules for things the agent already did right.

> New entries go at the top. Date each one. Keep rules short and testable.

---

## 2026-10-19

### Track every bug as an issue, fix it through its own PR
**What changed:** The user asked to open issues/PRs for the bugs found and close
them by merging, so it's visible which bugs were fixed. Branches are named
`feature/EDS-001` / `bug/EDS-002`. This replaces "commit straight to `main`"
below.

**Rule:** For each bug or feature, open a GitHub issue titled `EDS-NNN: …`
(label `bug` or `enhancement`; keep `EDS-NNN` equal to the issue number). Work on
`bug/EDS-NNN` or `feature/EDS-NNN`, open a PR whose body says `Fixes #NNN`, and
merge it (merge commit) once CI is green, so the issue closes with a link to the
fix. Bugs found but not fixed stay as open issues.

### Test the whole screen, not one block
**What went wrong:** One-block tests passed while a full-page scrape couldn't
even start the agent (146 KB prompt as one argv, E2BIG), and `block check`
passed blocks that rendered "h1" as the headline.

**Rule:** Before calling a design-source change done, run the full example page
(`site/example/`, 11 blocks) through `from-design` with a real agent, render the
blocks and look at the screenshots, not just the exit codes.

---

## 2026-10-14

### Resolve optional peer deps from the user's project, not just the bundle
**What went wrong:** The headless-Chromium scraper imported `playwright` relative
to the (often globally-installed) CLI bundle, so a Playwright the user had
installed in **their own project** (`npm i -D playwright`) wasn't found — the CLI
reported "Playwright not installed" even though it was. (Reported by the user:
"mam zainstalowane co trzeba" + the not-found error.)

**Rule:** A globally-installed CLI resolves bare `import()`/`require()` against
**its own** `node_modules`, not the user's cwd. For optional deps the user installs
in their project, also resolve from `process.cwd()` / the project root (via
`createRequire(pathToFileURL(...)).resolve(id, { paths })`, then dynamic-import the
resolved file URL) before declaring the dependency missing.

### Commit new files promptly — this repo resets the working tree
**What went wrong:** `CODING_STANDARDS.md` was created but left **untracked**
across several turns. Between turns, repo automation ran `git pull` (fast-forward)
and reset/cleaned the working tree, which **deleted the untracked file** — it was
never in history, so it was simply gone and had to be recreated from memory.

**Rule:** On this repo, assume the working tree can be reset between turns
(automation runs pulls, version-bump hooks, and likely `git clean`/`reset`). Any
deliverable file must be **committed in the same turn it's created** — never leave
new work untracked "to commit later". A fast-forward pull won't normally delete
untracked files, so when one disappears, suspect an automated clean/reset, not the
pull itself.

### Expect an auto version bump in the commit hook
**What went wrong:** Committing bumped `package.json` to `0.4.29` on its own
(`eds: auto-bumped version to 0.4.29` from a `.githooks` pre-commit hook), which
wasn't anticipated in the staged diff.

**Rule:** A `.githooks` pre-commit hook auto-bumps the version. Don't hand-edit the
version, and expect `package.json` to change in the commit even if you didn't stage
a version change. Verify the final commit contents rather than assuming the staged
diff is exactly what lands.

## 2026-10-13

### Git: commit straight to `main` on this repo (superseded 2026-10-19)
**What went wrong:** Asked to commit, the agent auto-created a feature branch
(`fix/site-eds-logo`) following generic "always use a feature branch + PR"
guidance. The user rejected the call and said "na maina" (commit to main).

**Rule:** On this project, commit directly to `main`. Do **not** create feature
branches unless explicitly asked. Still never `push` without explicit
confirmation, and still show `git status` + `git diff --staged` before committing.

### Small UI tweaks: check the obvious CSS quirk before over-diagnosing
**What went wrong:** For "popraw to na /docs" (a terse request with a screenshot
of the EDS logo), the agent ran a long investigation (many greps/reads) and then
posed an elaborate 3-option question with ASCII previews. The real ask was
trivial — remove an unneeded horizontal scrollbar (`overflow-x: auto` on
`.ansi-art`). The user bypassed all options with a one-liner: "ten scroll nie
jest potrzebny".

**Rule:** For small visible-UI tweaks, inspect the actual rendered element for
obvious quirks first — stray scrollbars (`overflow`), clipping, spacing — before
deep code archaeology. Keep clarifying questions to one short, concrete option
set; don't build elaborate multi-branch questions for what is usually a
one-line fix.

### State assumptions explicitly when you can't ask
**What went wrong:** In goal/stop-hook mode (can't pause to ask), the agent
changed `.term-art` to a gradient + solid blocks based on a best-guess reading of
"popraw to w terminalu na www". It landed, but the reasoning was uncertain.

**Rule:** When you genuinely cannot ask, make the **smallest reversible** change
that matches the most likely intent, and say the assumption out loud in the
summary so the user can correct it in one step.

### Keep the lockfile in sync when adding deps
**What went wrong:** `package.json` declared `pixelmatch`, `playwright`, `pngjs`
(visual-regression tooling) but `package-lock.json` was never updated, so CI's
`npm ci` failed.

**Rule:** Any change to `dependencies`/`devDependencies` in `package.json` must
be accompanied by a lockfile update (`npm install` or `npm install
--package-lock-only`) in the same commit. Verify with `npm ci --dry-run`.
