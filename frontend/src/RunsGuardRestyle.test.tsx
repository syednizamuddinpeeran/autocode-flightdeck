import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Guard from "./Guard";
import Runs from "./Runs";
import { statusTone } from "./ui";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("statusTone maps statuses to tones and defaults to neutral", () => {
  for (const s of ["pass", "allow"]) expect(statusTone(s)).toBe("success");
  for (const s of ["fail", "deny", "error"])
    expect(statusTone(s)).toBe("danger");
  expect(statusTone("needs-input")).toBe("warning");
  expect(statusTone("PASS")).toBe("success");
  expect(statusTone("something-new")).toBe("neutral");
});

test("Runs shows each status as a badge with text, and the detail in a card", async () => {
  const run = (issue: number, status: string) => ({
    repo_id: "r",
    repo_name: "alpha",
    issue,
    status,
    artifacts: [],
    source: "/w",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/runs"
        ? json({ runs: [run(1, "reviewed"), run(2, "error")] })
        : json({
            ...run(1, "reviewed"),
            plan_tasks: 1,
            review_verdict: null,
            blocking: 0,
            nit: 0,
            verify_result: null,
          }),
    ),
  );
  const { container } = render(<Runs />);
  const list = await screen.findByRole("list", { name: "Runs" });
  expect(within(list).getByText("reviewed").className).toContain(
    "badge-success",
  );
  expect(within(list).getByText("error").className).toContain("badge-danger");
  expect(container.querySelector(".page-header h2")?.textContent).toBe("Runs");
  expect(container.querySelector(".toolbar")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Issue 1" }));
  const detail = await screen.findByLabelText("Run detail");
  expect(detail.closest(".card")).not.toBeNull();
  expect(detail.querySelector("dl.detail-list")).not.toBeNull();
});

test("Runs error uses the shared error message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({}, 500)),
  );
  render(<Runs />);
  expect((await screen.findByRole("alert")).className).toContain(
    "error-message",
  );
});

test("Guard shows allow/deny as badges and the table in a scroll container", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        allow: 2,
        deny: 1,
        total: 3,
        skipped_lines: 0,
        reasons: [{ reason: "x", count: 1, sessions: [] }],
      }),
    ),
  );
  const { container } = render(<Guard />);
  await screen.findByText("x");
  expect(screen.getByText("Allowed").className).toContain("badge-success");
  expect(screen.getByText("Denied").className).toContain("badge-danger");
  expect(screen.getByRole("region", { name: "Denial reasons" })).toBeTruthy();
  expect(container.querySelector(".page-header h2")?.textContent).toBe("Guard");
});

test("Guard loading, empty and error states use the shared components", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const loading = render(<Guard />);
  expect(loading.container.querySelector(".loading")).not.toBeNull();
  loading.unmount();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({ allow: 0, deny: 0, total: 0, reasons: [], skipped_lines: 0 }),
    ),
  );
  const empty = render(<Guard />);
  await screen.findByText(/No guard decisions/);
  expect(empty.container.querySelector(".empty-state")).not.toBeNull();
});
