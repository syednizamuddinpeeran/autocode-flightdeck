// Theme state: mode (light | dark | system) and palette, persisted in
// localStorage. The pre-paint script in index.html applies the stored values
// before first paint; this module keeps them in sync afterwards.

export type Mode = "light" | "dark" | "system";

export interface Palette {
  id: string;
  label: string;
}

// To add a palette: add an entry here and token blocks in theme.css for
// :root[data-palette="<id>"][data-theme="light"] and ...[data-theme="dark"].
export const PALETTES: readonly Palette[] = [
  { id: "default", label: "Default" },
  { id: "high-contrast", label: "High contrast" },
  { id: "midnight", label: "Midnight" },
];

export const MODES: readonly { id: Mode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

// Same key and values as the inline script in index.html.
export const MODE_KEY = "flightdeck-theme";
export const PALETTE_KEY = "flightdeck-palette";
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
let memoryPalette: string | null = null;

/** Stored mode; anything missing or invalid is "system". */
export function getMode(): Mode {
  if (memoryMode) return memoryMode;
  const stored = read(MODE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** Stored palette id; anything missing or unknown is "default". */
export function getPalette(): string {
  const id = memoryPalette ?? read(PALETTE_KEY);
  return PALETTES.some((p) => p.id === id) ? (id as string) : "default";
}

export function resolveTheme(mode: Mode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** Write the current mode and palette to the root element. */
export function applyTheme(): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolveTheme(getMode()));
  const palette = getPalette();
  if (palette === "default") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", palette);
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

export function setPalette(id: string): void {
  const valid = PALETTES.some((p) => p.id === id) ? id : "default";
  memoryPalette = valid;
  write(PALETTE_KEY, valid === "default" ? null : valid);
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

/** Forget in-memory choices so the next read goes back to storage (tests). */
export function resetThemeState(): void {
  memoryMode = null;
  memoryPalette = null;
}
