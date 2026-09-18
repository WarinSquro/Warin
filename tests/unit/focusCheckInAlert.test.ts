import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ensureFocusCheckInNotificationPermission,
  showFocusCheckInNotification,
} from "../../utils/focusCheckInAlert";

describe("focusCheckInAlert", () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalNotification) {
      Object.defineProperty(globalThis, "Notification", {
        value: originalNotification,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-expect-error cleanup test stub
      delete globalThis.Notification;
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unsupported when Notification API is missing", async () => {
    // @ts-expect-error remove for test
    delete globalThis.Notification;
    await expect(ensureFocusCheckInNotificationPermission()).resolves.toBe("unsupported");
  });

  it("does not construct a notification when permission is not granted", () => {
    const ctor = vi.fn();
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      writable: true,
      value: Object.assign(ctor, { permission: "default" }),
    });
    showFocusCheckInNotification();
    expect(ctor).not.toHaveBeenCalled();
  });

  it("shows a tagged notification when permission is granted", () => {
    const ctor = vi.fn(function NotificationMock(this: { onclick: null }, _t: string, _o?: object) {
      this.onclick = null;
    });
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      writable: true,
      value: Object.assign(ctor, { permission: "granted" }),
    });
    showFocusCheckInNotification();
    expect(ctor).toHaveBeenCalledWith(
      "Continue Focused Work?",
      expect.objectContaining({ tag: "warin-focus-check-in" })
    );
  });
});
