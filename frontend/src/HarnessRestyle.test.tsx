import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Harness from "./Harness";
import HarnessTemplate from "./HarnessTemplate";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const empty = {
  agents: [],
  skills: [],
  hooks: [],
  deny_commands: { text: "", count: 0 },
  deny_paths: { text: "", count: 0 },
  commands: [{ key: "K", value: "v" }],
  complexity: [],
};

test("Harness uses the shared header, toolbar field and cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ repos: [{ id: "r", path: "/r" }] }))
      .mockResolvedValueOnce(json(empty)),
  );
  const { container } = render(<Harness />);
  await screen.findByText("/r");
  expect(container.querySelector(".page-header h2")?.textContent).toBe(
    "Harness",
  );
  expect(container.querySelector(".toolbar .field")).not.toBeNull();
  fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "r" } });
  await screen.findByText("K");
  expect(container.querySelectorAll(".card").length).toBe(7);
  expect(container.querySelectorAll(".empty-state").length).toBe(6);
  expect(container.querySelector("dl.pairs")).not.toBeNull();
});

test("Harness error uses the shared error message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({}, 500)),
  );
  render(<Harness />);
  expect((await screen.findByRole("alert")).className).toContain(
    "error-message",
  );
});

test("template form has a labelled field and a primary action", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? json({ path: "/t" }) : json({ path: null }),
    ),
  );
  const { container } = render(<HarnessTemplate />);
  expect(screen.getByLabelText("Harness template path")).toBeTruthy();
  const save = screen.getByRole("button", { name: "Save template" });
  expect(save.className).toContain("btn-primary");
  expect(save.getAttribute("type")).toBe("submit");
  expect(container.querySelector(".card")).not.toBeNull();
  fireEvent.click(save);
  expect(await screen.findByText("Saved: /t")).toBeTruthy();
});
