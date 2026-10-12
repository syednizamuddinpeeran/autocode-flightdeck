import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("renders title and settings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Flight deck",
  );
  expect(
    await screen.findByRole("heading", { level: 2, name: "Settings" }),
  ).toBeTruthy();
});
