// Reusable "autofocus first field" helper for forms/drawers/modals.
// Finds the first enabled, visible input/select/textarea inside a container
// and focuses it, instead of hand-rolling autoFocus/refs on every screen.
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = "input, select, textarea";

function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const input = el as HTMLInputElement;
  if (input.type === "hidden" || input.readOnly) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

/** Focuses the first enabled, visible input/select/textarea inside `container`. */
export function focusFirstField(container: HTMLElement | null | undefined): void {
  if (!container) return;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const target = candidates.find(isFocusable);
  target?.focus();
}

/**
 * Attach the returned ref to a form/modal/drawer container. Whenever `active`
 * is true (defaults to true — i.e. on mount), the first editable, enabled,
 * visible input/select/textarea inside the container is focused.
 */
export function useFocusFirstField<T extends HTMLElement = HTMLDivElement>(active = true) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const raf = window.requestAnimationFrame(() => focusFirstField(ref.current));
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
  return ref;
}
