import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Trends from "./Trends";
import css from "./Trends.css?raw";

const day = (date: string) => ({
  date,
  sessions: 1,
  errors: 2,
  tool_failures: 0,
  compactions: 0,
  stop_blocks: 0,
  verify_pass: 1,
  verify_fail: 0,
});

function stub(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data = {
  days: [day("2026-10-01"), day("2026-10-02")],
  totals: {},
  verified: [],
  enough_data: true,
  note: null,
};

test("charts take colour from theme classes, never inline or literal", async () => {
  stub(data);
  const { container } = render(<Trends />);
  await screen.findByRole("table");
  const bars = container.querySelectorAll("svg rect");
  expect(bars.length).toBe(14);
  for (const bar of bars) {
    expect(bar.getAttribute("fill")).toBeNull();
    expect(bar.getAttribute("style")).toBeNull();
    expect(bar.getAttribute("class")).toMatch(/\bbar\b/);
  }
  expect(css).toMatch(/\.bar\s*\{[^}]*var\(--color-accent\)/);
  expect(css).toMatch(/\.bar-bad\s*\{[^}]*var\(--color-danger\)/);
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/);
});

test("failure series are dashed and every chart is labelled, so colour is not the only cue", async () => {
  stub(data);
  const { container } = render(<Trends />);
  await screen.findByRole("table");
  expect(css).toMatch(/\.bar-bad\s*\{[^}]*stroke-dasharray/);
  const bad = [...container.querySelectorAll("figure")]
    .filter((f) => f.querySelector("rect.bar-bad"))
    .map((f) => f.querySelector("figcaption")?.textContent);
  expect(bad).toEqual(["Errors", "Tool failures", "Verify FAIL"]);
  for (const fig of container.querySelectorAll("figure")) {
    expect(fig.querySelector("figcaption")?.textContent).toBeTruthy();
    expect(fig.querySelector("svg")?.getAttribute("viewBox")).toBeTruthy();
  }
});

test("the table alternative is still present, in a scroll container", async () => {
  stub(data);
  render(<Trends />);
  const region = await screen.findByRole("region", {
    name: "Daily health counts table",
  });
  expect(region.querySelector("table caption")?.textContent).toBe(
    "Daily health counts",
  );
});

test("uses the shared header and error message", async () => {
  stub({}, 500);
  const { container } = render(<Trends />);
  expect((await screen.findByRole("alert")).className).toContain(
    "error-message",
  );
  expect(container.querySelector(".page-header h2")?.textContent).toBe(
    "Trends",
  );
});
