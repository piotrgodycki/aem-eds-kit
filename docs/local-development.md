# Local Development & Universal Editor

How to run an AEM Edge Delivery Services project locally, configure the proxy,
and preview content in the Universal Editor - and the `eds` commands that wire
each piece. Everything here is **light**: a local proxy plus the hosted editor
against your cloud author. No local AEM SDK, no local Universal Editor Service,
no Docker required.

> Related: [`universal-editor-fields.md`](./universal-editor-fields.md) for the
> field palette used in component models.

## The moving pieces

| Piece | What it is | Runs where |
|---|---|---|
| **AEM proxy** (`aem up`) | Serves your local blocks/CSS/JS, proxies content | `localhost` (your machine) |
| **Content source** | Where authored content lives | DA / Drive / SharePoint, or AEM author |
| **Universal Editor** | In-context WYSIWYG editing (UE/crosswalk only) | Hosted at experience.adobe.com |

The local proxy renders your code against **preview content** (`*.aem.page`), so
code changes hot-reload instantly while content comes from the real source.

## `.env` - the proxy config

The AEM CLI (`aem up`) reads a `.env` at the project root. `eds init` writes one
by default (and `eds scaffold env` (re)generates it on demand):

```bash
AEM_OPEN=/            # path opened in the browser on start ("/" = home; set a page path to deep-link)
AEM_PORT=3007         # local proxy port
AEM_PAGES_URL=        # content origin to proxy from (the *.aem.page preview host)
```

- `AEM_PAGES_URL` is **prefilled from your git remote** as
  `https://main--<repo>--<owner>.aem.page`.
- The file is **never overwritten** by the CLI and is **always gitignored** - it
  is local-only and may hold other secrets, so it never enters version control.

Generate or refresh it:

```bash
eds scaffold env                               # interactive (prompts for each value)
eds scaffold env --port 3007 --open / --yes    # non-interactive
eds init --no-env                              # opt out during setup
```

Then start the proxy:

```bash
npm install
aem up            # opens http://localhost:3007 (per AEM_PORT)
```

## `xwalk.json` - Universal Editor multi-field

Crosswalk (Universal Editor) projects need `xwalk.json` at the project root to
enable **multi-field** support in the editor. `eds init` writes it by default for
UE projects; regenerate with `eds scaffold xwalk`:

```json
{
  "public": {
    "xwalk": {
      "multi-field": {
        "enabled": true
      }
    }
  }
}
```

```bash
eds scaffold xwalk        # write it on demand (never overwrites)
eds init --no-xwalk       # opt out during setup
```

## `eds ue` - readiness check + editor deep link

Two light helpers for the Universal Editor. No infrastructure to stand up.

### `eds ue check`

An **offline** readiness report. It confirms the project is UE-ready and lists
which blocks are actually editable:

- **Project is UE-ready** when `component-definition.json` **and**
  `component-models.json` are present (`component-filters.json` completes the set).
- **A block is editable** when it has a model - either a distributed
  `_<name>.json` in `blocks/<name>/`, or an entry in `component-models.json`.
  A block with no model won't appear in the editor; `ue check` flags it before
  you open the editor and wonder why it's missing.

```bash
eds ue check
```

It also reports whether `head.html` declares an `aemconnection` meta - only
relevant for local-SDK editing, so it's informational for cloud-author setups.

### `eds ue open [path]`

Builds and opens the deep link into the hosted Universal Editor, pointing the
editor canvas at your preview host (derived from the git remote):

```bash
eds ue open /products                                  # edit /products
eds ue open / --org my-org --ref dev                   # org slug + branch
eds ue open /blog --url main--site--owner.aem.page     # override the host
eds ue open / --no-open                                # print the link only
```

The link format is:

```
https://experience.adobe.com/#/[@<org>/]aem/editor/canvas/<host>/<path>
```

where `<host>` defaults to `main--<repo>--<owner>.aem.page`. Pass `--org` to skip
the editor's org picker, `--ref` to target another branch, or `--url` to point at
any delivery host.

## Typical loop (Universal Editor, cloud author)

1. `eds init` (writes `.env`, `xwalk.json`, UE config) → `npm install`.
2. `aem up` - local proxy on `AEM_PORT`.
3. `eds ue check` - confirm blocks are editable.
4. `eds ue open <path>` - author in the Universal Editor; content saves to your
   cloud author and previews on `*.aem.page`.
5. Edit block code locally; the proxy hot-reloads.
6. Commit & push; the AEM Code Sync pipeline deploys.
