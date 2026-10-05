# Universal Editor Field Reference

The complete catalog of field `component` types available in AEM Edge Delivery
Services Universal Editor component models (`_<block>.json` → `models[].fields`,
or the aggregated `component-models.json`). `eds block create` and
`eds block from-figma` generate these; use this as the authoritative palette.

> Canonical source: the Universal Editor JSON schemas
> (`model-definition-fields.schema.json`, `model-definition.schema.json`).

## Field structure

Every field shares this base shape; **`component`, `name`, `label` are always required**:

```json
{
  "component": "<type>",
  "name": "<propertyName>",
  "label": "<Display Label>",
  "valueType": "<string|string[]|number|date|boolean>",
  "value": "<default>",
  "description": "<helper text>"
}
```

## The 17 field types

| component | valueType (enforced) | Use for |
|---|---|---|
| `text` | `string` | Single-line: titles, labels, alt text |
| `textarea` | `string` | Multi-line plain text: descriptions, notes |
| `richtext` | `string` | Formatted copy (bold/italic/lists/links) |
| `reference` | `string` | AEM asset (image/video/doc) from DAM |
| `aem-content` | any | Page link / URL / content path (content picker) |
| `aem-content-fragment` | any | Content Fragment reference |
| `aem-experience-fragment` | any | Experience Fragment reference |
| `aem-tag` | `string` | Tag picker for categorization |
| `select` | `string` | Single-choice dropdown — requires `options` |
| `multiselect` | `string` | Multiple choice — requires `options` |
| `checkbox-group` | `string[]` | Multiple independent toggles — requires `options` |
| `radio-group` | `string` | Mutually exclusive choice — requires `options` |
| `boolean` | `boolean` | Single on/off toggle |
| `number` | `number` | Counts, limits |
| `date-time` | `date` | Date/time picker |
| `container` | any | Group nested `fields`; `multi:true` = repeatable |
| `tab` | any | Property-panel tab separator (UI only, not data) |

`valueType` is enforced for all types except `aem-content`,
`aem-content-fragment`, `aem-experience-fragment`, `container`, `tab` (flexible).
Valid values: `string`, `string[]`, `number`, `date`, `boolean`.

## Examples per type

### Text — `text` / `textarea` / `richtext`
```json
{ "component": "text", "name": "title", "label": "Title", "valueType": "string" }
{ "component": "textarea", "name": "description", "label": "Description", "valueType": "string" }
{ "component": "richtext", "name": "text", "label": "Text", "value": "", "valueType": "string" }
```

### Media & content — `reference` / `aem-content` / `aem-content-fragment` / `aem-experience-fragment` / `aem-tag`
```json
{ "component": "reference", "name": "image", "label": "Image", "valueType": "string", "multi": false }
{ "component": "aem-content", "name": "link", "label": "Link", "valueType": "string" }
{ "component": "aem-content-fragment", "name": "articlepath", "label": "Article CF", "valueType": "string" }
{ "component": "aem-experience-fragment", "name": "fragment", "label": "Experience Fragment", "valueType": "string" }
{ "component": "aem-tag", "name": "tags", "label": "Tags", "valueType": "string" }
```

### Selection — `select` / `multiselect` / `checkbox-group` / `radio-group`
```json
{ "component": "select", "name": "titleType", "label": "Title Type", "valueType": "string", "value": "h2",
  "options": [ { "name": "H1", "value": "h1" }, { "name": "H2", "value": "h2" }, { "name": "H3", "value": "h3" } ] }

{ "component": "multiselect", "name": "classes", "label": "Style", "valueType": "string", "maxSize": 3,
  "options": [ { "name": "Theme", "children": [ { "name": "Light", "value": "light" }, { "name": "Dark", "value": "dark" } ] } ] }

{ "component": "checkbox-group", "name": "features", "label": "Features", "valueType": "string[]",
  "options": [ { "name": "Show Title", "value": "show-title" }, { "name": "Show CTA", "value": "show-cta" } ] }

{ "component": "radio-group", "name": "orientation", "label": "Orientation", "valueType": "string", "value": "horizontal",
  "options": [ { "name": "Horizontal", "value": "horizontal" }, { "name": "Vertical", "value": "vertical" } ] }
```

### Data — `boolean` / `number` / `date-time`
```json
{ "component": "boolean", "name": "hideHeading", "label": "Hide Heading", "valueType": "boolean", "value": false }
{ "component": "number", "name": "maxItems", "label": "Max Items", "valueType": "number",
  "validation": { "numberMin": 1, "numberMax": 12 } }
{ "component": "date-time", "name": "startDate", "label": "Start Date", "valueType": "date" }
```

### Structural — `container` / `tab`
```json
{ "component": "container", "name": "ctas", "label": "Call to Actions", "collapsible": false, "multi": true,
  "fields": [
    { "component": "richtext", "name": "text", "label": "Text", "valueType": "string" },
    { "component": "aem-content", "name": "link", "label": "Link" }
  ] }

{ "component": "tab", "name": "validation", "label": "Validation" }
```
`multi: true` makes a container repeatable (add/remove items — e.g. cards, slides).
Everything after a `tab` appears on that tab until the next `tab`.

## Semantic collapsing (field naming → HTML)

Name paired fields so EDS collapses them into a single element in the authored DOM:

| Fields | Collapses to |
|---|---|
| `image` (reference) + `imageAlt` (text) | `<picture><img alt="…"></picture>` |
| `link` (aem-content) + `linkText` + `linkTitle` + `linkType` | `<a href title>text</a>` (+ class) |
| `title` (text) + `titleType` (select h1–h6) | `<h2>title</h2>` at chosen level |
| `classes` (multiselect) | values become CSS classes on the block root |
| `group_*` prefix | grouped into a single cell |

## Common field properties

`value` (default) · `required` · `readOnly` · `hidden` · `multi` · `description` ·
`options` (select/multiselect/checkbox-group/radio-group) · `maxSize` (multiselect) ·
`collapsible`/`fields` (container) · `condition` (JSON Logic show/hide) · `validation` · `raw`.

### Validation
- `text`: `minLength`, `maxLength`, `regExp`, `customErrorMsg`
- `number`: `numberMin`, `numberMax`, `customErrorMsg`
- `boolean`: `customErrorMsg`
- `aem-content`: `rootPath` (limit the picker to a directory)

### Conditional fields (JSON Logic)
```json
{ "component": "text", "name": "customUrl", "label": "Custom URL", "valueType": "string",
  "condition": { "==": [ { "var": "linkType" }, "custom" ] } }
```

## Gotchas

- Register the block in `component-filters.json` `section` filter or authors can't add it.
- `template.model` must match the model `id`; `template.filter` must match the filter `id`.
- No underscores in field `name`s with xwalk — except the `group_` grouping prefix.
- Container blocks use a `filter` (not a `model`) + item definition with resourceType
  `core/franklin/components/block/v1/block/item`.
