import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Guard from "./Guard";

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

test("shows totals and reasons linking to sessions, redaction as logged", async () => {
  stub({
    allow: 5,
    deny: 3,
    total: 8,
    skipped_lines: 0,
    reasons: [
      {
        reason: "blocked [REDACTED] path",
        count: 3,
        sessions: [{ repo_id: "r1", session_id: "s1" }],
      },
    ],
  });
  render(<Guard />);
  expect(await screen.findByText("blocked [REDACTED] path")).toBeTruthy();
  expect(screen.getByTestId("allow").textContent).toBe("5");
  expect(screen.getByTestId("deny").textContent).toBe("3");
  expect(screen.getByTestId("total").textContent).toBe("8");
  const link = screen.getByRole("link", { name: "s1" });
  expect(link.getAttribute("href")).toBe("#/sessions/r1/s1");
});

test("shows empty state when there are no events", async () => {
  stub({ allow: 0, deny: 0, total: 0, reasons: [], skipped_lines: 0 });
  render(<Guard />);
  expect(await screen.findByText(/No guard decisions/)).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});

test("shows an error when the request fails", async () => {
  stub({}, 500);
  render(<Guard />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/Could not/);
});
