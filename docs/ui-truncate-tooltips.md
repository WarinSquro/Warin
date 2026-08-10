# Truncated text — full value on hover

**Rule:** When a field value is wider than its cell and shows ellipsis (`…`), the **full text** must be available on hover. This applies **app-wide**.

## How it works

`TruncateHoverTitles` is mounted once in `App.tsx`. On `mouseover` of any element with Tailwind class **`truncate`**, it:

1. Measures whether text overflows (`scrollWidth > clientWidth`).
2. If yes, sets the native `title` attribute to the full string (browser tooltip).
3. If no (or no longer overflowing), clears the title **only when we set it**.

Intentional `title` values that differ from the cell text (e.g. holiday hints) are **not** overwritten.

## Preferred component (new UI)

Use `components/TruncateText.tsx` for new truncated labels/buttons:

```tsx
import { TruncateText } from "../components/TruncateText";

<TruncateText
  as="button"
  text={project.name}
  className="text-[13px] font-medium text-foreground hover:text-primary"
  onClick={onEdit}
/>
```

Plain markup is fine too — just include `truncate` (and usually `min-w-0` inside flex rows):

```tsx
<button type="button" className="min-w-0 truncate …">{name}</button>
```

## Opt-out / overrides

| Attribute | Purpose |
|-----------|---------|
| `data-full-text="…"` | Tooltip text when visible content is not the full string |
| `data-no-truncate-title` | Skip hover title (on the node or an ancestor) |

## Do not

- Rely on clipping alone with no way to read the full value.
- Wrap truncated nodes in `inline-flex` tooltips that break `text-overflow: ellipsis` unless the wrapper also constrains width (`min-w-0` / fixed width).

## Related

- Implementation: `components/TruncateHoverTitles.tsx`, `components/TruncateText.tsx`
- UI standards: `docs/change-implementation-standards.md`
- Agent rule: `.cursor/rules/oneview-ui.mdc`
