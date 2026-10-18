import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMode,
  initTheme,
  resetThemeState,
  setMode,
  subscribe,
} from "./theme";

type Listener = () => void;

function stubMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  return {
    set(value: boolean) {
      dark = value;
      listeners.forEach((l) => l());
    },
    count: () => listeners.size,
  };
}

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  resetThemeState();
  root.removeAttribute("data-theme");
});
afterEach(() => vi.unstubAllGlobals());

describe("mode", () => {
  it("is system when nothing is stored", () => {
    expect(getMode()).toBe("system");
  });

  it("falls back to system for an invalid stored value", () => {
    localStorage.setItem("flightdeck-theme", "neon");
    expect(getMode()).toBe("system");
  });

  it("applies immediately and persists", () => {
    stubMatchMedia(false);
    setMode("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("flightdeck-theme")).toBe("dark");
    resetThemeState();
    expect(getMode()).toBe("dark");
  });

  it("system removes the stored value and follows the OS", () => {
    stubMatchMedia(true);
    setMode("light");
    setMode("system");
    expect(localStorage.getItem("flightdeck-theme")).toBeNull();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("does not crash when storage throws", () => {
    stubMatchMedia(false);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(getMode()).toBe("system");
    expect(() => setMode("dark")).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("works when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => initTheme()).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});

describe("live OS changes", () => {
  it("updates while System is selected and notifies subscribers", () => {
    const os = stubMatchMedia(false);
    const stop = initTheme();
    expect(root.getAttribute("data-theme")).toBe("light");
    const seen = vi.fn();
    const unsubscribe = subscribe(seen);

    os.set(true);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    stop();
    expect(os.count()).toBe(0);
  });

  it("ignores OS changes when a mode is chosen", () => {
    const os = stubMatchMedia(false);
    initTheme();
    setMode("light");
    os.set(true);
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});
