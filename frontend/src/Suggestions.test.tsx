import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Suggestions from "./Suggestions";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("lists suggestions with evidence links", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    json({
      suggestions: [
        {
          type: "guard-denials",
          repo_id: "r1",
          title: "Review a deny rule",
          config_file: ".github/hooks/policy/deny-commands.txt",
          evidence: {
            count: 3,
            sessions: [{ repo_id: "r1", session_id: "s1" }],
          },
        },
        {
          type: "complexity",
          repo_id: "r1",
          title: "Raise nothing, split issues",
          config_file: "scripts/factory/complexity.env",
          evidence: { count: 2, runs: [{ repo_id: "r1", issue: 7 }] },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<Suggestions />);
  const list = await screen.findByRole("list", { name: "Suggestions" });
  expect(within(list).getByText("Review a deny rule")).toBeTruthy();
  expect(within(list).getByText("scripts/factory/complexity.env")).toBeTruthy();
  const link = within(list).getByRole("link", { name: "s1" });
  expect(link.getAttribute("href")).toBe("#session=r1/s1");
  expect(within(list).getByText(/r1 issue 7/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/suggestions");
});

test("shows an empty state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ suggestions: [] })));
  render(<Suggestions />);
  expect(await screen.findByText("No suggestions right now.")).toBeTruthy();
});
