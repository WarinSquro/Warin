# OneView theme

Design tokens for the Phase-1 UI. Source of truth for CSS variables: `index.css` and `theme/tokens.css`. Tailwind bridges them in `tailwind.config.js`.

## Brand

| Token | Value | Tailwind |
|-------|-------|----------|
| `--color-brand` | `#001433` | `brand` |
| `--color-brand-fg` | `#b8d4f0` | `brand-fg` |
| `--color-brand-muted` | `#5a8fc4` | `brand-muted` |
| `--color-brand-active` | `#002855` | `brand-active` |
| `--color-brand-border` | `#003366` | `brand-border` |

Navy aligned with the OneView logo (`#003399` family). Sidebar / chrome use brand; primary actions use indigo primary.

## Auth canvas

| Token | Value |
|-------|-------|
| `--color-auth-canvas` | `#f2f7fd` |
| `--color-auth-canvas-from` | `#eef5fc` |
| `--color-auth-canvas-via` | `#f2f7fd` |
| `--color-auth-canvas-to` | `#d6e8f7` |

Helpers: `.auth-canvas-bg` (gradient), `.auth-canvas-solid`.

## Primary & surfaces

| Token | Value | Tailwind |
|-------|-------|----------|
| `--color-primary` | `#4f46e5` | `primary` |
| `--color-primary-foreground` | `#ffffff` | `primary-foreground` |
| `--color-background` | `#f4f5f7` | `background` |
| `--color-surface` | `#ffffff` | `surface` |
| `--color-surface-alt` | `#fafafa` | `surface-alt` |
| `--color-highlight` | `#f4f5ff` | `highlight` |

## Text & borders

| Token | Value | Tailwind |
|-------|-------|----------|
| `--color-foreground` | `#111827` | `foreground` |
| `--color-muted` | `#6b7280` | `muted` |
| `--color-muted-foreground` | `#6b7280` | `muted-foreground` |
| `--color-border` | `#e5e7eb` | `border` |
| `--color-border-soft` | `#eef0f3` | `border-soft` |
| `--color-border-focus` | mix of foreground + border | focused inputs (global) |
| `--duration-focus` | `200ms` | input focus transition |

Focused text fields, textareas, selects, and similar controls use a slightly darker border + thin outline via global rules in `index.css` (keyboard and mouse focus). Checkbox/radio are excluded.

## Accent soft (allocation chips)

| Token | Value | Tailwind |
|-------|-------|----------|
| `--color-accent-soft` | `#eef2ff` | `accent-soft` |
| `--color-accent-soft-fg` | `#4338ca` | `accent-softfg` |
| `--color-accent-line` | `#c7c8f0` | `accent-line` |

## Status

| Role | Tokens |
|------|--------|
| Success | `--color-success` `#16a34a`, `-fg`, `-soft`, `-border` |
| Warning | `--color-warning` `#b45309`, `-soft`, `-border` |
| Danger | `--color-danger` `#dc2626`, `-fg`, `-soft`, `-border` |

## Radii

| Token | Value | Tailwind |
|-------|-------|----------|
| `--radius-sm` | `4px` | `rounded-sm` |
| `--radius-md` | `6px` | `rounded-md` |
| `--radius-lg` | `8px` | `rounded-lg` |

## Typography

- **Sans:** Inter (400–700)
- **Mono:** JetBrains Mono (400–500)

Loaded via Google Fonts import in `index.css`.

## Rules for agents / designers

1. Prefer token classes (`bg-brand`, `text-muted`, `border-border`) over raw hex in JSX.
2. Do not introduce a second theme system or dark-mode palette unless requested.
3. Keep login / shell header on the auth canvas palette.
4. When adding status colors, extend the success/warning/danger soft sets rather than one-off greens/reds.
