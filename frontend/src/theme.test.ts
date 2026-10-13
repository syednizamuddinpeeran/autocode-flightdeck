import { describe, expect, it } from "vitest";
import rawCss from "./theme.css?raw";
import mainSource from "./main.tsx?raw";

const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");

const COLOR_TOKENS = [
  "--color-surface",
  "--color-text",
  "--color-text-muted",
  "--color-border",
  "--color-accent",
  "--color-on-accent",
  "--color-success",
  "--color-on-success",
  "--color-warning",
  "--color-on-warning",
  "--color-danger",
  "--color-on-danger",
];
const SHARED_TOKENS = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--radius",
  "--font-sans",
  "--shadow",
];

function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `block ${selector} exists`).not.toBeNull();
  const out: Record<string, string> = {};
  for (const decl of match![1].split(";")) {
    const idx = decl.indexOf(":");
    if (idx > 0) out[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme tokens", () => {
  it("defines every token on :root", () => {
    const root = block(":root");
    for (const t of [...COLOR_TOKENS, ...SHARED_TOKENS]) {
      expect(root[t], t).toBeTruthy();
    }
  });

  for (const theme of ["light", "dark"]) {
    it(`${theme} palette defines all colour tokens`, () => {
      const palette = block(`:root[data-theme="${theme}"]`);
      for (const t of COLOR_TOKENS) expect(palette[t], t).toBeTruthy();
    });
  }

  it("light and dark palettes differ for surface and text", () => {
    const light = block(':root[data-theme="light"]');
    const dark = block(':root[data-theme="dark"]');
    expect(light["--color-surface"]).not.toBe(dark["--color-surface"]);
    expect(light["--color-text"]).not.toBe(dark["--color-text"]);
  });

  for (const theme of ["light", "dark"]) {
    it(`${theme} palette meets WCAG 4.5:1`, () => {
      const p = block(`:root[data-theme="${theme}"]`);
      const pairs: [string, string][] = [
        ["--color-text", "--color-surface"],
        ["--color-text-muted", "--color-surface"],
        ["--color-on-accent", "--color-accent"],
        ["--color-on-success", "--color-success"],
        ["--color-on-warning", "--color-warning"],
        ["--color-on-danger", "--color-danger"],
      ];
      for (const [fg, bg] of pairs) {
        expect(contrast(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
  }

  it("is imported by main.tsx", () => {
    expect(mainSource).toMatch(/import\s+["']\.\/theme\.css["']/);
  });
});
