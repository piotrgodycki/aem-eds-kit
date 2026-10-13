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

## 2026-10-14

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

### Git: commit straight to `main` on this repo
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
