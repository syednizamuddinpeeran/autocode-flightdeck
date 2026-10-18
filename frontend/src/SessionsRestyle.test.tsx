import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Sessions from "./Sessions";
import { SessionTimeline } from "./SessionTimeline";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Sessions uses the shared header, toolbar select and table container", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/folders") return json([{ id: "f", path: "/w" }]);
      if (url === "/api/repos")
        return json({ repos: [{ id: "r", path: "/a" }] });
      return json({ sessions: [], skipped_lines: 0 });
    }),
  );
  const { container } = render(<Sessions />);
  const filter = await screen.findByLabelText("Repo");
  expect(container.querySelector(".page-header h2")?.textContent).toBe(
    "Sessions",
  );
  expect(container.querySelector(".card .toolbar")?.contains(filter)).toBe(
    true,
  );
  expect(
    screen
      .getByRole("region", { name: "Sessions table" })
      .querySelector("table"),
  ).not.toBeNull();
});

test("Sessions empty and error states use the shared components", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([])),
  );
  const { container } = render(<Sessions />);
  await screen.findByRole("link", { name: /settings/i });
  expect(container.querySelector(".empty-state")).not.toBeNull();
  cleanup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({}, 500)),
  );
  render(<Sessions />);
  expect((await screen.findByRole("alert")).className).toContain(
    "error-message",
  );
});

test("timeline is a vertical list: kind labels are badges, no inline colours", async () => {
  const base = { ts: "t", summary: "", duration_ms: null, failed: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        events: [
          { ...base, event: "a", denied: false },
          { ...base, event: "b", failed: true, denied: false },
          { ...base, event: "c", denied: true },
        ],
      }),
    ),
  );
  const { container } = render(<SessionTimeline repo="r" id="s" />);
  await screen.findByText("b");
  expect(container.querySelector("ol.timeline")).not.toBeNull();
  expect(container.querySelectorAll(".timeline-item")).toHaveLength(3);
  expect(screen.getByText("[FAILED]").className).toContain("badge-danger");
  expect(screen.getByText("[DENIED]").className).toContain("badge-warning");
  expect(container.querySelector("[style]")).toBeNull();
  expect(container.querySelectorAll("time")).toHaveLength(3);
});

test("timeline loading, empty and error states use the shared components", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const { container, unmount } = render(<SessionTimeline repo="r" id="s" />);
  expect(container.querySelector(".loading")).not.toBeNull();
  unmount();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ events: [] })),
  );
  const empty = render(<SessionTimeline repo="r" id="s" />);
  await screen.findByText("This session has no events.");
  expect(empty.container.querySelector(".empty-state")).not.toBeNull();
});
