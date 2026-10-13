import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Runs from "./Runs";

const runs = [
  ["r1", "alpha", 1, "reviewed"],
  ["r2", "beta", 2, "needs-input"],
].map(([repo_id, repo_name, issue, status]) => ({
  repo_id,
  repo_name,
  issue,
  status,
  artifacts: ["brief.md"],
  source: `/w/${repo_name}`,
}));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("lists runs, filters by repo, shows detail", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ runs }))
    .mockResolvedValueOnce(
      json({
        ...runs[1],
        plan_tasks: 3,
        review_verdict: "APPROVE",
        blocking: 2,
        nit: 4,
        verify_result: "PASS",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);

  render(<Runs />);
  const list = await screen.findByRole("list", { name: "Runs" });
  expect(within(list).getByText("alpha")).toBeTruthy();
  expect(screen.getByText("needs-input")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "r2" } });
  expect(within(list).queryByText("alpha")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Issue 2" }));
  const detail = await screen.findByLabelText("Run detail");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/repos/r2/runs/2");
  expect(within(detail).getByText("PASS")).toBeTruthy();
  expect(within(detail).getByText("APPROVE")).toBeTruthy();
  expect(within(detail).getByText("/w/beta")).toBeTruthy();
});
