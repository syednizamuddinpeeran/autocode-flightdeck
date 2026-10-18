import { describe, expect, it } from "vitest";
import rawCss from "./theme.css?raw";
import { PALETTES } from "./theme";

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

function selectorFor(palette: string, mode: string): string {
  return palette === "default"
    ? `:root[data-theme="${mode}"]`
    : `:root[data-palette="${palette}"][data-theme="${mode}"]`;
}

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

const PAIRS: [string, string][] = [
  ["--color-text", "--color-surface"],
  ["--color-text-muted", "--color-surface"],
  ["--color-accent", "--color-surface"],
  ["--color-on-accent", "--color-accent"],
  ["--color-on-success", "--color-success"],
  ["--color-on-warning", "--color-warning"],
  ["--color-on-danger", "--color-danger"],
];

describe.each(PALETTES.map((p) => p.id))("palette %s", (id) => {
  for (const mode of ["light", "dark"]) {
    it(`${mode}: defines every colour token as a hex value`, () => {
      const b = block(selectorFor(id, mode));
      for (const t of COLOR_TOKENS) expect(b[t], t).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it(`${mode}: text/background and accent/background meet WCAG AA 4.5:1`, () => {
      const b = block(selectorFor(id, mode));
      for (const [fg, bg] of PAIRS) {
        expect(contrast(b[fg], b[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
  }
});

it("palette blocks only override colour tokens", () => {
  for (const { id } of PALETTES.filter((p) => p.id !== "default")) {
    for (const mode of ["light", "dark"]) {
      const keys = Object.keys(block(selectorFor(id, mode)));
      for (const k of keys) expect(COLOR_TOKENS, `${id} ${k}`).toContain(k);
    }
  }
});
