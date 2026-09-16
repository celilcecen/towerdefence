import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../src/app/version";
import type { HapticKind } from "../src/platform/native";
import { createNativeShell } from "../src/platform/native";

const plugins = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    App: {
      addListener: vi.fn((name: string, handler: () => void) => {
        listeners.set(name, handler);
        return Promise.resolve({ remove: () => undefined });
      }),
      exitApp: vi.fn(() => Promise.resolve()),
    },
    Haptics: {
      impact: vi.fn(() => Promise.reject(new Error("no motor"))),
      notification: vi.fn(() => Promise.resolve()),
    },
    StatusBar: { hide: vi.fn(() => Promise.resolve()) },
    SplashScreen: { hide: vi.fn(() => Promise.resolve()) },
  };
});

vi.mock("@capacitor/app", () => ({ App: plugins.App }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: plugins.Haptics,
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING" },
}));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: plugins.StatusBar }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: plugins.SplashScreen }));

const KINDS: readonly HapticKind[] = ["light", "medium", "heavy", "success", "warning"];

function fakeWindow(
  options: { native?: boolean; vibrate?: (pattern: number | number[]) => boolean } = {},
) {
  const handlers: (() => void)[] = [];
  const document = {
    hidden: false,
    addEventListener: (_: string, handler: () => void) => handlers.push(handler),
  };
  const navigator = options.vibrate ? { vibrate: options.vibrate } : {};
  const scope = {
    document,
    navigator,
    ...(options.native === undefined
      ? {}
      : { Capacitor: { isNativePlatform: () => options.native } }),
  } as unknown as Window;
  const flip = (hidden: boolean) => {
    document.hidden = hidden;
    for (const handler of handlers) handler();
  };
  return { scope, flip };
}

beforeEach(() => {
  plugins.listeners.clear();
  vi.clearAllMocks();
});

describe("web shell", () => {
  it("vibrates where supported and survives browsers that refuse", async () => {
    const vibrate = vi.fn(() => true);
    const shell = await createNativeShell(fakeWindow({ vibrate }).scope);
    expect(shell.isNative).toBe(false);
    for (const kind of KINDS) shell.haptic(kind);
    expect(vibrate).toHaveBeenCalledTimes(KINDS.length);
    expect(vibrate).toHaveBeenCalledWith([12, 60, 18]);

    const blocked = await createNativeShell(
      fakeWindow({
        vibrate: () => {
          throw new Error("blocked");
        },
      }).scope,
    );
    expect(() => {
      blocked.haptic("heavy");
    }).not.toThrow();
    const silent = await createNativeShell(fakeWindow({ native: false }).scope);
    expect(() => {
      silent.haptic("light");
    }).not.toThrow();
  });

  it("maps page visibility to pause and resume, and ignores back and ready", async () => {
    const { scope, flip } = fakeWindow();
    const shell = await createNativeShell(scope);
    const pause = vi.fn();
    const resume = vi.fn();
    shell.onPause(pause);
    shell.onResume(resume);
    shell.onBack(() => true);
    shell.ready();

    flip(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    flip(false);
    expect(resume).toHaveBeenCalledOnce();
  });
});

describe("capacitor shell", () => {
  it("drives the native plugins and swallows their failures", async () => {
    const shell = await createNativeShell(fakeWindow({ native: true }).scope);
    expect(shell.isNative).toBe(true);
    expect(plugins.StatusBar.hide).toHaveBeenCalledOnce();

    for (const kind of KINDS) shell.haptic(kind);
    expect(plugins.Haptics.impact).toHaveBeenCalledTimes(3);
    expect(plugins.Haptics.impact).toHaveBeenCalledWith({ style: "HEAVY" });
    expect(plugins.Haptics.notification).toHaveBeenCalledWith({ type: "WARNING" });

    shell.ready();
    expect(plugins.SplashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    await Promise.resolve();
  });

  it("closes the app only when the back handler has nothing left to go back to", async () => {
    const shell = await createNativeShell(fakeWindow({ native: true }).scope);
    let canGoBack = true;
    const pause = vi.fn();
    const resume = vi.fn();
    shell.onBack(() => canGoBack);
    shell.onPause(pause);
    shell.onResume(resume);

    plugins.listeners.get("backButton")?.();
    expect(plugins.App.exitApp).not.toHaveBeenCalled();
    canGoBack = false;
    plugins.listeners.get("backButton")?.();
    expect(plugins.App.exitApp).toHaveBeenCalledOnce();

    plugins.listeners.get("pause")?.();
    plugins.listeners.get("resume")?.();
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it("falls back to the web shell when the plugins cannot start", async () => {
    plugins.StatusBar.hide.mockImplementationOnce(() => {
      throw new Error("plugin missing");
    });
    const shell = await createNativeShell(fakeWindow({ native: true }).scope);
    expect(shell.isNative).toBe(false);
  });
});

it("reports a semantic app version", () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
