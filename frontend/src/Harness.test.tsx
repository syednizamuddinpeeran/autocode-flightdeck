import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Harness from "./Harness";

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

async function open(harness: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ repos: [{ id: "r1", path: "/r1" }] }))
    .mockResolvedValueOnce(jsonResponse(harness));
  vi.stubGlobal("fetch", fetchMock);
  render(<Harness />);
  await screen.findByText("/r1");
  fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "r1" } });
  return fetchMock;
}

test("renders all sections with counts and masked values", async () => {
  const fetchMock = await open({
    agents: [
      { name: "planner", description: "Plans", tools: ["Read", "Grep"] },
    ],
    skills: [{ name: "open-pr", description: "Opens PRs" }],
    hooks: [{ event: "PreToolUse", script: "guard.sh", timeout: 5 }],
    deny_commands: { text: "rm -rf\nsudo", count: 2 },
    deny_paths: { text: ".env*", count: 1 },
    commands: [{ key: "API_TOKEN", value: "********" }],
    complexity: [{ key: "MAX_FILES", value: "15" }],
  });
  expect(await screen.findByText("planner")).toBeTruthy();
  expect(screen.getByText(/Tools: Read, Grep/)).toBeTruthy();
  expect(screen.getByText("open-pr")).toBeTruthy();
  expect(screen.getByText(/guard\.sh \(timeout 5s\)/)).toBeTruthy();
  expect(screen.getByText("Deny commands (2)")).toBeTruthy();
  expect(screen.getByText("Deny paths (1)")).toBeTruthy();
  expect(screen.getByText("********")).toBeTruthy();
  expect(screen.getByText("15")).toBeTruthy();
  expect(fetchMock.mock.calls[1][0]).toBe("/api/repos/r1/harness");
});

test("shows an empty state for each missing section", async () => {
  await open({
    agents: [],
    skills: [],
    hooks: [],
    deny_commands: { text: "", count: 0 },
    deny_paths: { text: "", count: 0 },
    commands: [],
    complexity: [],
  });
  expect(await screen.findAllByText("None found.")).toHaveLength(7);
});
