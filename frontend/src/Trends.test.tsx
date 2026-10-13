import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Trends from "./Trends";

const day = (date: string, errors: number) => ({
  date,
  sessions: 1,
  errors,
  tool_failures: 0,
  compactions: 0,
  stop_blocks: 0,
  verify_pass: 1,
  verify_fail: 0,
});

function stub(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows charts and an accessible table with enough data", async () => {
  stub({
    days: [day("2026-10-01", 2), day("2026-10-02", 3)],
    totals: { errors: 5, sessions: 2 },
    verified: [],
    enough_data: true,
    note: null,
  });
  render(<Trends />);
  expect(await screen.findByRole("table")).toBeTruthy();
  expect(screen.getAllByRole("img").length).toBe(7);
  expect(screen.getByText("2026-10-02")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

test("shows totals and the more-data note with fewer than 2 days", async () => {
  stub({
    days: [day("2026-10-01", 2)],
    totals: { errors: 2 },
    verified: [],
    enough_data: false,
    note: "Trends need at least 2 days of data; showing totals only.",
  });
  render(<Trends />);
  expect((await screen.findByRole("status")).textContent).toContain(
    "at least 2 days",
  );
  expect(screen.getByText("Errors: 2")).toBeTruthy();
  expect(screen.queryAllByRole("img").length).toBe(0);
});
