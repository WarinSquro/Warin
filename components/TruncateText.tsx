import {
  createElement,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

type TruncateTag = "span" | "div" | "p" | "button";

type TruncateTextProps = {
  /** Prefer this over children when the visible string is known. */
  text?: string;
  children?: ReactNode;
  className?: string;
  as?: TruncateTag;
  /** Override tooltip text (defaults to `text` or element text content). */
  fullText?: string;
  /** Skip app-wide truncate hover title (rare). */
  disableHoverTitle?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, "children"> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "onClick">;

/**
 * Preferred truncated text node. Uses Tailwind `truncate`; full value appears
 * on hover when overflowing (via app-wide `TruncateHoverTitles`).
 *
 * @see docs/ui-truncate-tooltips.md
 */
export function TruncateText({
  text,
  children,
  className = "",
  as = "span",
  fullText,
  disableHoverTitle = false,
  type = "button",
  ...rest
}: TruncateTextProps) {
  const content = text ?? children;
  const classes = ["truncate", "min-w-0", className].filter(Boolean).join(" ");

  const props: Record<string, unknown> = {
    ...rest,
    className: classes,
    ...(fullText != null && fullText !== "" ? { "data-full-text": fullText } : {}),
    ...(disableHoverTitle ? { "data-no-truncate-title": "" } : {}),
  };

  if (as === "button" && props.type == null) {
    props.type = type;
  }

  return createElement(as, props, content);
}
