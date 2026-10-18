/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";

const styles = import.meta.glob("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const sources = import.meta.glob(["./**/*.tsx", "!./**/*.test.*"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const theme = strip(styles["./theme.css"]);
const others = Object.entries(styles)
  .filter(([file]) => file !== "./theme.css")
  .map(([file, text]) => [file, strip(text)] as const);

describe("stylesheets", () => {
  test("every stylesheet is found", () => {
    expect(others.length).toBeGreaterThanOrEqual(6); // styles, App, ui, Trends, Harness, Forms
  });

  test("only theme.css holds colour literals", () => {
    for (const [file, css] of others) {
      expect(css, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    }
  });

  test("every token they use is defined in theme.css", () => {
    const defined = new Set(
      [...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    for (const [file, css] of others) {
      for (const [, name] of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
        expect(defined.has(name), `${file}: ${name}`).toBe(true);
      }
    }
  });
});

describe("focus, keyboard and motion", () => {
  test("focus is visible with a 2px accent outline", () => {
    expect(strip(styles["./styles.css"])).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/,
    );
  });

  test("no rule removes an outline, except the skip-link target", () => {
    for (const [file, css] of others) {
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (/outline\s*:\s*(none|0)\b/.test(body)) {
          expect(selector.trim(), file).toBe(".shell-main:focus");
        }
      }
    }
  });

  test("prefers-reduced-motion turns off transitions and animations", () => {
    const css = strip(styles["./styles.css"]);
    const block =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(
        css,
      );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/transition:\s*none/);
    expect(block![1]).toMatch(/animation:\s*none/);
    expect(block![1]).toMatch(/scroll-behavior:\s*auto/);
  });

  test("no positive tabindex, and clicks only on real controls", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/tabIndex=\{\s*[1-9]/);
      expect(text, file).not.toMatch(
        /<(?:div|span|li|td|th|tr|p|section|article)\b[^>]*\bonClick=/,
      );
    }
  });
});
