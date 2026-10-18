/// <reference types="vite/client" />
import { expect, test } from "vitest";

// Every .ts/.tsx source file (tests excluded) as raw text.
const sources = import.meta.glob(
  ["./**/*.ts", "./**/*.tsx", "!./**/*.test.*"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;

// Files that still hard-code colours and are due to be restyled with theme
// tokens (issue #53, SessionTimeline). Remove an entry when its file is clean;
// the test below fails if an entry is stale, so this list can only shrink.
const PENDING_RESTYLE = ["./SessionTimeline.tsx"];

test("src/ has no colour literals outside theme.css", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(10);
  const offenders = Object.entries(sources)
    .filter(
      ([file, text]) => COLOUR.test(text) && !PENDING_RESTYLE.includes(file),
    )
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test("the pending-restyle list has no stale entries", () => {
  for (const file of PENDING_RESTYLE) {
    expect(sources[file], `${file} exists`).toBeDefined();
    expect(COLOUR.test(sources[file]), `${file} still has colours`).toBe(true);
  }
});

test("the scan itself catches colour literals", () => {
  for (const bad of ['"#fff"', "'#b00020'", "rgb(0,0,0)", "hsla(1,2%,3%,1)"]) {
    expect(COLOUR.test(bad), bad).toBe(true);
  }
  expect(COLOUR.test("var(--color-text)")).toBe(false);
});
