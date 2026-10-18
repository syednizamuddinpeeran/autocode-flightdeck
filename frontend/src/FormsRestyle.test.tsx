import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Install from "./Install";
import Settings from "./Settings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Install: labelled fields, secondary Preview, primary Confirm", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/install/preview"
        ? json({
            preview_id: "p",
            would_create: [],
            would_overwrite: [],
            requires_overwrite: false,
          })
        : json({ repos: [] }),
    ),
  );
  const { container } = render(<Install />);
  expect(container.querySelector(".page-header h2")?.textContent).toBe(
    "Install harness",
  );
  for (const name of [
    "Discovered repo",
    "Target folder",
    "Repo type",
    "OS",
    "Assistant",
    "Cloud",
  ])
    expect(screen.getByLabelText(name).closest(".field")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Preview" }).className).toContain(
    "btn-secondary",
  );
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/w" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  const confirm = await screen.findByRole("button", {
    name: "Confirm install",
  });
  expect(confirm.className).toContain("btn-primary");
  expect(container.querySelector(".card")).not.toBeNull();
});

test("Install: error uses the shared error message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/install/preview"
        ? json({ detail: "bad folder" }, 422)
        : json({ repos: [] }),
    ),
  );
  render(<Install />);
  fireEvent.change(screen.getByLabelText("Target folder"), {
    target: { value: "/x" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect((await screen.findByRole("alert")).className).toContain(
    "error-message",
  );
});

test("Settings: shared header, primary Add, danger Remove, Appearance in a card", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json([{ id: "1", path: "/a" }])),
  );
  const { container } = render(<Settings />);
  await screen.findByText("/a");
  expect(container.querySelector(".page-header h2")?.textContent).toBe(
    "Settings",
  );
  expect(screen.getByRole("button", { name: "Add" }).className).toContain(
    "btn-primary",
  );
  expect(screen.getByRole("button", { name: "Remove" }).className).toContain(
    "btn-danger",
  );
  expect(screen.getByLabelText("Folder path").closest(".field")).not.toBeNull();
  expect(
    screen.getByRole("heading", { name: "Appearance" }).closest(".card"),
  ).not.toBeNull();
  expect(container.querySelector("ul.folder-list")).not.toBeNull();
});
