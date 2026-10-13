import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SessionTimeline, parseHash } from "./SessionTimeline";

function mockEvents(events: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ repo_id: "r", session_id: "s", events }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("renders events and distinguishes errors, failures and denials", async () => {
  const base = { duration_ms: null, failed: false, denied: false };
  const fetchMock = mockEvents([
    { ...base, ts: "1", event: "userPromptSubmitted", summary: "hello" },
    {
      ...base,
      ts: "2",
      event: "postToolUse",
      summary: "bash",
      duration_ms: 1500,
    },
    {
      ...base,
      ts: "3",
      event: "postToolUseFailure",
      summary: "boom",
      failed: true,
    },
    { ...base, ts: "4", event: "preToolUse", summary: "rm", denied: true },
    { ...base, ts: "5", event: "errorOccurred", summary: "crash" },
  ]);
  render(<SessionTimeline repo="r" id="s" />);

  expect(await screen.findByText("hello")).toBeTruthy();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/repos/r/sessions/s");
  expect(screen.getByText("(1.5 s)")).toBeTruthy();
  const kinds = screen
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-kind"));
  expect(kinds).toEqual(["normal", "normal", "failed", "denied", "error"]);
  expect(screen.getByText(/\[FAILED\]/)).toBeTruthy();
  expect(screen.getByText(/\[DENIED\]/)).toBeTruthy();
  expect(screen.getByText(/\[ERROR\]/)).toBeTruthy();
});

test("shows an empty state when the session has no events", async () => {
  mockEvents([]);
  render(<SessionTimeline repo="r" id="s" />);
  expect(await screen.findByText("This session has no events.")).toBeTruthy();
});

test("shows an error when the request fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  render(<SessionTimeline repo="r" id="s" />);
  expect((await screen.findByRole("alert")).textContent).toContain("Could not");
});

test("parses the session hash", () => {
  expect(parseHash("#session=repo/abc")).toEqual({ repo: "repo", id: "abc" });
  expect(parseHash("#other")).toBeNull();
});
