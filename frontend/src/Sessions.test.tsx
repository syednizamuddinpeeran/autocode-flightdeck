import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Sessions from "./Sessions";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("prompts to add a watched folder when there are none", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse([])),
  );
  render(<Sessions />);
  const link = await screen.findByRole("link", { name: /settings/i });
  expect(link.getAttribute("href")).toBe("#settings");
});

test("lists sessions and filters by repo", async () => {
  const session = {
    repo_id: "r1",
    session_id: "s1",
    start: "2026-01-01T10:00:00.000Z",
    end: null,
    branch: "agent/x",
    surface: "cli",
    end_reason: null,
  };
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/folders") return jsonResponse([{ id: "f", path: "/w" }]);
    if (url === "/api/repos")
      return jsonResponse({ repos: [{ id: "r1", path: "/w/a" }] });
    return jsonResponse({ sessions: [session], skipped_lines: 2 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Sessions />);
  expect(await screen.findByText("s1")).toBeTruthy();
  expect(screen.getByText("running")).toBeTruthy();
  expect(screen.getByText(/2 malformed/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "r1" } });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions?repo=r1"),
  );
});
