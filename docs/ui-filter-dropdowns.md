# Filter dropdowns (single & multi-select)

Use the shared filter dropdown components for **all** toolbar and form selects. Do **not** add native HTML `<select>` for new UI.

## When to use which

| Need | Component | Example |
|------|-----------|---------|
| Pick **one** option (toolbar / compact) | `FilterSingleSelect` | Department filter on Resource Planner, status on Team Projects |
| Pick **one** option (form, optional empty row) | `FilterSelect` | Allocation drawer fields |
| Pick **many** options | `FilterMultiSelect` | “All Departments ▾” on Resource Planner |

All three share the same trigger chrome: bordered button, label left-truncated, `▾` flush right (`inline-flex justify-between gap-3`), portal menu with search.

## Trigger appearance

Matches Resource Planner department filter:

```text
[ All Departments          ▾ ]
```

Classes (on trigger): `inline-flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-surface-alt`.

## Example (single-select)

```tsx
import { FilterSingleSelect } from "../components/FilterSingleSelect";

<FilterSingleSelect
  value={status}
  onChange={setStatus}
  options={[
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ]}
  aria-label="Project status filter"
/>
```

## Required behavior

- **Focus on open:** menu search input receives focus when opened (type-to-search without extra click).
- **Keyboard:** ↑/↓ highlight rows; Enter selects (single) or toggles (multi). Escape closes and returns focus to trigger.
- **Menu rows:** text only — no radio/checkbox dots in the list.

## References

- `components/FilterSingleSelect.tsx`
- `components/FilterMultiSelect.tsx`
- `components/FilterSelect.tsx`
- `.cursor/rules/oneview-ui.mdc`
