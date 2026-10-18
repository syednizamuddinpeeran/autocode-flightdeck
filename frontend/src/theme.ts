// Theme state: mode (light | dark | system), persisted in localStorage. The
// pre-paint script in index.html applies the stored value before first paint;
// this module keeps it in sync afterwards.

export type Mode = "light" | "dark" | "system";

export const MODES: readonly { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

// Same key and values as the inline script in index.html.
export const MODE_KEY = "flightdeck-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  );
}

let memoryMode: Mode | null = null;

/** Stored mode; anything missing or invalid is "system". */
export function getMode(): Mode {
  if (memoryMode) return memoryMode;
  const stored = read(MODE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveTheme(mode: Mode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** Write the current mode to the root element. */
export function applyTheme(): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(getMode()));
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function setMode(mode: Mode): void {
  memoryMode = mode;
  write(MODE_KEY, mode === "system" ? null : mode);
  applyTheme();
  notify();
}

/** Be told when mode or palette changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply the stored theme and follow OS changes while the mode is System. */
export function initTheme(): () => void {
  applyTheme();
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (getMode() === "system") {
      applyTheme();
      notify();
    }
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Forget the in-memory choice so the next read goes back to storage (tests). */
export function resetThemeState(): void {
  memoryMode = null;
}
