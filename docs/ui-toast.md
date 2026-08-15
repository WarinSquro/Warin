# Toast messages — duration and hover pause

**Rule:** All toast notifications use the shared `ToastProvider` / `useToast()`. This applies **app-wide**, including new screens and components.

## Behavior

1. A toast stays visible for **5 seconds** by default.
2. If the pointer is over the toast, it **stays visible** and the auto-dismiss timer **pauses**.
3. When the pointer leaves, the toast dismisses only after the **remaining** time has elapsed (not a full 5 seconds again).
4. The **×** control still dismisses immediately.

## How to show a toast (required)

Use `useToast()` from `context/ToastContext.tsx`. Do **not** add a local/snackbar toast with a different duration or hover behavior.

```tsx
import { useToast } from "../context/ToastContext";

const toast = useToast();
toast.created(); // or toast.updated() / toast.deleted()
toast.error("…");
toast.success("…");
toast.info("…");
toast.warning("…");
```

Timing is owned by `ToastProvider` (`TOAST_DURATION_MS` in `utils/toastTiming.ts`). Screens must not pass a custom timeout.

## Do not

- Invent a one-off toast, `alert()`, or inline banner for the same success/error patterns.
- Hardcode 3s (or any other duration) for notifications.
- Bypass `ToastProvider` for new UI.

## Related

- Implementation: `context/ToastContext.tsx`, `components/ToastViewport.tsx`, `utils/toastTiming.ts`
- UI standards: `docs/change-implementation-standards.md`
- Agent rule: `.cursor/rules/oneview-ui.mdc`
