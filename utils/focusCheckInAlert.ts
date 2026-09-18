/**
 * Audible + OS alerts when Focus check-in (“Continue Focused Work?”) opens.
 * Browsers require a prior user gesture for reliable audio; notification permission is per-origin.
 */

const NOTIFICATION_TAG = "warin-focus-check-in";

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/** Resume/create AudioContext after a user gesture (e.g. Focus Start) so later beeps are allowed. */
export function primeFocusCheckInAudio(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume().finally(() => {
      window.setTimeout(() => {
        void ctx.close().catch(() => undefined);
      }, 50);
    });
  } catch {
    /* ignore */
  }
}

/** Short two-tone beep (best-effort; may be blocked if tab never had a gesture). */
export function playFocusCheckInBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (when: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.22, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.18);
    };
    void ctx.resume().then(() => {
      const t = ctx.currentTime;
      beep(t, 880);
      beep(t + 0.2, 1174.7);
      window.setTimeout(() => {
        void ctx.close().catch(() => undefined);
      }, 500);
    });
  } catch {
    /* ignore */
  }
}

export async function ensureFocusCheckInNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** OS notification when check-in opens (no-op if permission not granted). */
export function showFocusCheckInNotification(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Continue Focused Work?", {
      body: "Focus check-in — confirm within 30 seconds or the timer stops automatically.",
      tag: NOTIFICATION_TAG,
      requireInteraction: true,
    });
    n.onclick = () => {
      if (typeof window !== "undefined") {
        try {
          window.focus();
        } catch {
          /* ignore */
        }
      }
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/** Beep + OS notification for a newly opened check-in prompt. */
export function alertFocusCheckInOpened(): void {
  playFocusCheckInBeep();
  showFocusCheckInNotification();
}

/** Call from Focus Start (user gesture): prime audio + request notification permission once. */
export function prepareFocusCheckInAlerts(): void {
  primeFocusCheckInAudio();
  void ensureFocusCheckInNotificationPermission();
}
