# Site analytics (dataLayer)

`site/analytics.js` pushes these events to `window.dataLayer`, ready for GTM / GA4. No tag manager is loaded yet; add the GTM snippet to the pages when there is a container. Append `?debug_datalayer` to any page URL to log the events in the console.

Every event carries `page` (for example `index.html`).

| Event | When | Parameters |
|---|---|---|
| `cta_click` | GitHub, npm, Quick start, install guide, docs or studio links | `cta` (`github`, `npm`, `quick_start`, `install_guide`, `docs`, `studio`, `studio_download`), `location` (`nav`, `hero`, `footer`, or a section id), `link_url`, `link_text`, `platform` (downloads only) |
| `copy_command` | a copy button | `command` (e.g. `npm i -g aem-eds-kit`, `agent_setup_prompt`), `location` |
| `search_open` | the search overlay opens | `method` (`button`, `shortcut`, `slash`) |
| `search` | typing stops for 0.9 s, 2+ characters | `search_term`, `results` (0 = no results) |
| `search_result_click` | a result is opened | `search_term`, `link_url`, `position` |
| `mega_menu_open` / `mega_menu_click` | a mega menu panel, or a link in it | `menu`, `link_text`, `link_url` |
| `faq_open` | an FAQ answer is opened | `question` |
| `section_view` | a page section crosses the middle of the screen, once | `section` |
| `scroll_depth` | 25, 50, 75, 90 % of the page | `percent` |
| `outbound_click` | any other external link | `link_url`, `link_domain`, `location` |
