import { type KeyboardEvent, type Ref } from "react";
import { Search } from "lucide-react";

/** Shared chrome for type-to-search inside dropdown menus (matches toolbar Resource… search). */
export const DROPDOWN_MENU_SEARCH_INPUT_CLASS =
  "h-8 w-full rounded-md border border-border bg-surface py-0 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent-line";

/**
 * Bordered h-8 search field for open dropdown panels.
 * Callers must focus this on open (after the menu portal mounts) so type-to-search works immediately.
 */
export function DropdownMenuSearch({
  inputRef,
  value,
  onChange,
  onKeyDown,
  placeholder = "Type to search…",
  "aria-label": ariaLabel = "Search options",
}: {
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <div className="flex-shrink-0 border-b border-border-soft px-2 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={DROPDOWN_MENU_SEARCH_INPUT_CLASS}
        />
      </div>
    </div>
  );
}
