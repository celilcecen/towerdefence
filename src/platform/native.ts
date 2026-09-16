export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning";

/**
 * What the game needs from the host platform. In a browser it is a thin
 * fallback; inside the Capacitor app it talks to the native plugins. The
 * plugin code is loaded with dynamic imports only on native, so the web build
 * never downloads it.
 */
export interface NativeShell {
  readonly isNative: boolean;
  haptic(kind: HapticKind): void;
  /** The handler returns false when the app should close (back at the home screen). */
  onBack(handler: () => boolean): void;
  onPause(handler: () => void): void;
  onResume(handler: () => void): void;
  /** Called once the first frame is on screen. */
  ready(): void;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

const VIBRATION_MS: Readonly<Record<HapticKind, number | number[]>> = {
  light: 8,
  medium: 16,
  heavy: 30,
  success: [12, 60, 18],
  warning: [24, 50, 24],
};

/** Browsers: vibration where supported (Android Chrome), page visibility for pause. */
function webShell(scope: Window): NativeShell {
  return {
    isNative: false,
    haptic(kind) {
      try {
        if ("vibrate" in scope.navigator) scope.navigator.vibrate(VIBRATION_MS[kind]);
      } catch {
        // Some browsers throw when vibration is blocked by policy; haptics are optional.
      }
    },
    onBack: () => undefined,
    onPause(handler) {
      scope.document.addEventListener("visibilitychange", () => {
        if (scope.document.hidden) handler();
      });
    },
    onResume(handler) {
      scope.document.addEventListener("visibilitychange", () => {
        if (!scope.document.hidden) handler();
      });
    },
    ready: () => undefined,
  };
}

async function capacitorShell(): Promise<NativeShell> {
  const [{ App }, { Haptics, ImpactStyle, NotificationType }, { StatusBar }, { SplashScreen }] =
    await Promise.all([
      import("@capacitor/app"),
      import("@capacitor/haptics"),
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);
  const quietly = (promise: Promise<unknown>): void => {
    promise.catch(() => undefined);
  };
  quietly(StatusBar.hide());

  return {
    isNative: true,
    haptic(kind) {
      switch (kind) {
        case "light":
          quietly(Haptics.impact({ style: ImpactStyle.Light }));
          break;
        case "medium":
          quietly(Haptics.impact({ style: ImpactStyle.Medium }));
          break;
        case "heavy":
          quietly(Haptics.impact({ style: ImpactStyle.Heavy }));
          break;
        case "success":
          quietly(Haptics.notification({ type: NotificationType.Success }));
          break;
        case "warning":
          quietly(Haptics.notification({ type: NotificationType.Warning }));
          break;
      }
    },
    onBack(handler) {
      quietly(
        App.addListener("backButton", () => {
          if (!handler()) quietly(App.exitApp());
        }),
      );
    },
    onPause(handler) {
      quietly(App.addListener("pause", handler));
    },
    onResume(handler) {
      quietly(App.addListener("resume", handler));
    },
    ready() {
      quietly(SplashScreen.hide({ fadeOutDuration: 250 }));
    },
  };
}

export async function createNativeShell(scope: Window): Promise<NativeShell> {
  const capacitor = (scope as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    try {
      return await capacitorShell();
    } catch {
      return webShell(scope);
    }
  }
  return webShell(scope);
}
