import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";

// Runs the real inline script from index.html, so the test cannot drift from it.
const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

function run(opts: {
  stored?: string | null;
  dark?: boolean;
  throws?: boolean;
}) {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      if (opts.throws) throw new Error("denied");
      return key === "flightdeck-theme" ? (opts.stored ?? null) : null;
    },
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && !!opts.dark,
  }));
  new Function(script)();
  return root.getAttribute("data-theme");
}

describe("pre-paint theme script", () => {
  beforeEach(() => document.documentElement.removeAttribute("data-theme"));
  afterEach(() => vi.unstubAllGlobals());

  it("is an inline script in <head>, before the app bundle", () => {
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain("<script>");
    expect(html.indexOf("<script>")).toBeLessThan(
      html.indexOf("/src/main.tsx"),
    );
  });

  it("follows prefers-color-scheme when nothing is stored", () => {
    expect(run({ dark: true })).toBe("dark");
    expect(run({ dark: false })).toBe("light");
  });

  it("applies a stored choice over the system preference", () => {
    expect(run({ stored: "light", dark: true })).toBe("light");
    expect(run({ stored: "dark", dark: false })).toBe("dark");
  });

  it("ignores an unknown stored value", () => {
    expect(run({ stored: "system", dark: true })).toBe("dark");
    expect(run({ stored: "bogus", dark: false })).toBe("light");
  });

  it("falls back to the system preference when storage throws", () => {
    expect(run({ throws: true, dark: true })).toBe("dark");
  });
});
