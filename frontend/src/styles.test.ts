import { describe, expect, it } from "vitest";
import rawStyles from "./styles.css?raw";
import rawTheme from "./theme.css?raw";
import mainSource from "./main.tsx?raw";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const styles = strip(rawStyles);
const theme = strip(rawTheme);

describe("base styles", () => {
  it("is imported by main.tsx after the tokens", () => {
    const tokens = mainSource.search(/import\s+["']\.\/theme\.css["']/);
    const base = mainSource.search(/import\s+["']\.\/styles\.css["']/);
    expect(tokens).toBeGreaterThanOrEqual(0);
    expect(base).toBeGreaterThan(tokens);
  });

  it("styles the core elements", () => {
    for (const selector of [
      "body",
      "h1",
      "a",
      ":focus-visible",
      "button",
      "input",
      "table",
      "th",
      "code",
    ]) {
      const re = new RegExp(`(^|[\\s,}])${selector}[\\s,{:]`, "m");
      expect(styles, selector).toMatch(re);
    }
  });

  it("takes every colour from tokens, never a literal", () => {
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styles).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });

  it("only references tokens that theme.css defines", () => {
    const defined = new Set(
      [...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const used = [...styles.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const t of used) expect(defined.has(t), t).toBe(true);
  });

  it("keeps links underlined and focus visible (not colour-only)", () => {
    expect(styles).toMatch(/a\s*\{[^}]*text-decoration:\s*underline/);
    expect(styles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px/);
  });

  it("link colour (accent on surface) meets 4.5:1 in both themes", () => {
    // theme.test.ts covers the other pairs; links are the one it does not.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const name of ["light", "dark"]) {
      const m = new RegExp(`data-theme="${name}"\\]\\s*\\{([^}]*)\\}`).exec(
        theme,
      )!;
      const get = (t: string) =>
        new RegExp(`${t}:\\s*(#[0-9a-fA-F]{6})`).exec(m[1])![1];
      const [hi, lo] = [
        lum(get("--color-accent")),
        lum(get("--color-surface")),
      ].sort((a, b) => b - a);
      expect((hi + 0.05) / (lo + 0.05), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses only text/background pairs whose contrast is verified", () => {
    const allowed = new Set([
      "--color-text/--color-surface",
      "--color-text-muted/--color-surface",
      "--color-accent/--color-surface",
      "--color-on-accent/--color-accent",
    ]);
    for (const [, body] of styles.matchAll(/\{([^}]*)\}/g)) {
      const fg = /(?:^|;|\s)color:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      const bg = /background:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      if (fg && bg)
        expect(allowed.has(`${fg}/${bg}`), `${fg}/${bg}`).toBe(true);
    }
  });
});
