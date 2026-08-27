import { useEffect, useRef, type KeyboardEvent } from "react";

export function PinBoxes({
  pin,
  onChange,
  error,
  disabled,
  autoFocus,
  onComplete,
}: {
  pin: string[];
  onChange: (next: string[]) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: () => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const complete = pin.length === 5 && pin.every((d) => d !== "");

  useEffect(() => {
    if (!complete) return;
    if (document.activeElement !== refs.current[4]) return;
    onComplete?.();
  }, [complete, onComplete]);

  const setDigit = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[i] = digit;
    onChange(next);
    if (digit && i < 4) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i]!;
    onChange(next);
    refs.current[Math.min(text.length, 4)]?.focus();
  };

  return (
    <div className="flex gap-2.5">
      {pin.map((d, i) => (
        <input
          key={i}
          id={i === 0 ? "ops-pin-0" : undefined}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          type="password"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`PIN digit ${i + 1}`}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          className={`h-[42px] w-[42px] rounded-lg border text-center text-[18px] font-semibold text-foreground outline-none transition-colors focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25 ${
            d ? "border-brand-border/50" : ""
          } ${error ? "border-danger bg-danger-soft/40" : "border-brand-border/20 bg-white"}`}
        />
      ))}
    </div>
  );
}
