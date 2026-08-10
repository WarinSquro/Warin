import { useEffect } from "react";

/** Marks titles we set so intentional `title` attributes are not overwritten. */
const OWNED = "data-ov-truncate-title";

function isOverflowing(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function fullText(el: HTMLElement): string {
  const explicit = el.getAttribute("data-full-text");
  if (explicit != null && explicit !== "") return explicit;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Sync native tooltip for a `.truncate` node — only when text overflows. */
export function syncTruncateTitle(el: HTMLElement): void {
  if (el.closest("[data-no-truncate-title]")) return;

  const text = fullText(el);
  if (!text) return;

  const existing = el.getAttribute("title");
  const weOwn = el.getAttribute(OWNED) === "1";
  // Preserve deliberate titles that are not the cell text (e.g. status hints).
  if (existing && !weOwn && existing !== text) return;

  if (isOverflowing(el)) {
    el.setAttribute("title", text);
    el.setAttribute(OWNED, "1");
  } else if (weOwn) {
    el.removeAttribute("title");
    el.removeAttribute(OWNED);
  }
}

/**
 * App-wide: on hover of any `.truncate` element, show full text via `title`
 * when the value is clipped with ellipsis.
 */
export function TruncateHoverTitles() {
  useEffect(() => {
    const onOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(".truncate");
      if (!(el instanceof HTMLElement)) return;
      syncTruncateTitle(el);
    };

    document.addEventListener("mouseover", onOver, true);
    return () => document.removeEventListener("mouseover", onOver, true);
  }, []);

  return null;
}
