import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Appearance from "./Appearance";
import { resetThemeState } from "./theme";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  resetThemeState();
  root.removeAttribute("data-theme");
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("offers Light, Dark and System as a labelled radio group", () => {
  render(<Appearance />);
  const group = screen.getByRole("group", { name: "Theme" });
  expect(group).toBeTruthy();
  const radios = screen.getAllByRole("radio");
  expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
    "light",
    "dark",
    "system",
  ]);
  // One name groups them, so arrow keys move between options natively.
  expect(new Set(radios.map((r) => (r as HTMLInputElement).name)).size).toBe(1);
  expect((screen.getByLabelText("System") as HTMLInputElement).checked).toBe(
    true,
  );
});

test("picking Dark applies immediately and persists", () => {
  render(<Appearance />);
  fireEvent.click(screen.getByLabelText("Dark"));
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(localStorage.getItem("flightdeck-theme")).toBe("dark");
  expect((screen.getByLabelText("Dark") as HTMLInputElement).checked).toBe(
    true,
  );
});

test("starts on System when storage holds an invalid value", () => {
  localStorage.setItem("flightdeck-theme", "bogus");
  render(<Appearance />);
  expect((screen.getByLabelText("System") as HTMLInputElement).checked).toBe(
    true,
  );
});
