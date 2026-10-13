import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Install from "./Install";
import HarnessTemplate from "./HarnessTemplate";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PREVIEW = {
  preview_id: "p1",
  would_create: ["a.md"],
  would_overwrite: ["b.md"],
  requires_overwrite: true,
};

test("confirm is unavailable without a preview", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<Install />);
  expect(screen.queryByRole("button", { name: "Confirm install" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("preview, required overwrite, install, then rescan", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(200, PREVIEW))
    .mockResolvedValueOnce(json(200, { exit_code: 0, output: "done" }))
    .mockResolvedValueOnce(json(200, []));
  vi.stubGlobal("fetch", fetchMock);
  render(<Install />);
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/repo" },
  });
  fireEvent.change(screen.getByLabelText("Cloud"), {
    target: { value: "aws" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  const confirm = (await screen.findByRole("button", {
    name: "Confirm install",
  })) as HTMLButtonElement;
  expect(screen.getByText("b.md")).toBeTruthy();
  expect(confirm.disabled).toBe(true);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    target: "/repo",
    repo: "github",
    os: "linux",
    assistant: "copilot",
    cloud: "aws",
  });

  fireEvent.click(screen.getByLabelText("Overwrite existing files"));
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);

  expect(await screen.findByText("done")).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock.mock.calls[1][0]).toBe("/api/install");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    preview_id: "p1",
    overwrite: true,
  });
  expect(fetchMock.mock.calls[2][0]).toBe("/api/repos/rescan");
});

test("shows 422 from preview and offers no confirm", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(json(422, { detail: "Target is not a git repo" })),
  );
  render(<Install />);
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/x" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Target is not a git repo",
  );
  expect(screen.queryByRole("button", { name: "Confirm install" })).toBeNull();
});

test("editing the target discards the preview", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, PREVIEW)));
  render(<Install />);
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/repo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByRole("button", { name: "Confirm install" });
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/other" },
  });
  expect(screen.queryByRole("button", { name: "Confirm install" })).toBeNull();
});

test("harness template saves and shows 422", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(200, { path: null }))
    .mockResolvedValueOnce(json(422, { detail: "No install.sh in /bad" }))
    .mockResolvedValueOnce(json(200, { path: "/good" }));
  vi.stubGlobal("fetch", fetchMock);
  render(<HarnessTemplate />);
  const input = screen.getByLabelText("Harness template path");
  fireEvent.change(input, { target: { value: "/bad" } });
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "No install.sh in /bad",
  );
  fireEvent.change(input, { target: { value: "/good" } });
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  expect(await screen.findByText("Saved: /good")).toBeTruthy();
  expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
});

test("tolerates a stub returning an array", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
  render(<HarnessTemplate />);
  render(<Install />);
  expect(await screen.findAllByRole("heading")).toBeTruthy();
});
