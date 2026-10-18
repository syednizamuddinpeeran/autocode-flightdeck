import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import appCss from "./App.css?raw";
import { parseRoute } from "./routes";

beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        // The session detail API returns an object; every other list is [].
        new Response(
          /\/sessions\//.test(String(url)) ? '{"events":[]}' : "[]",
          {
            status: 200,
          },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom applies the stylesheet but not its media query, so the small-screen
// Menu button counts as hidden and has no computed name. Find it by its link
// to the navigation instead.
const toggleButton = () =>
  document.querySelector<HTMLButtonElement>(
    'button[aria-controls="main-nav"]',
  )!;

const h2 = (name: string | RegExp) =>
  screen.queryByRole("heading", { level: 2, name });

describe("navigation", () => {
  test("shows the product name and a link to every page", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Flight deck",
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = Array.from(nav.querySelectorAll("a")).map(
      (a) => a.textContent,
    );
    expect(labels.join(",")).toBe(
      "Sessions,Guard,Runs,Harness,Trends,Install,Settings",
    );
  });

  test("Sessions is the default page and is marked current", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Sessions" }),
    ).toBeTruthy();
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Sessions");
    expect(h2("Settings")).toBeNull();
  });

  test("choosing a link shows only that page and updates the hash", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Guard" }));
    await waitFor(() => expect(h2("Guard")).not.toBeNull());
    expect(window.location.hash).toBe("#/guard");
    expect(h2("Sessions")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Guard" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Sessions" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  test("follows hash changes (reload, back and forward)", async () => {
    window.location.hash = "#/runs";
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Runs" }),
    ).toBeTruthy();
    window.location.hash = "#/trends";
    await waitFor(() => expect(h2("Trends")).not.toBeNull());
    expect(h2("Runs")).toBeNull();
  });

  test("session timeline stays reachable from Sessions", async () => {
    window.location.hash = "#session=repo/abc";
    render(<App />);
    expect(h2("Sessions")).not.toBeNull();
    expect(h2("Session timeline")).not.toBeNull();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/repos/repo/sessions/abc"),
    );
  });

  test("keeps the other components reachable on their pages", async () => {
    window.location.hash = "#/harness";
    render(<App />);
    expect(h2("Harness")).not.toBeNull();
    cleanup();
    window.location.hash = "#/trends";
    render(<App />);
    expect(h2("Suggestions")).not.toBeNull();
  });
});

describe("routes", () => {
  test("older links and unknown hashes", () => {
    expect(parseRoute("#settings")).toBe("settings");
    expect(parseRoute("#session=r/1")).toBe("sessions");
    expect(parseRoute("")).toBe("sessions");
    expect(parseRoute("#/nope")).toBe("sessions");
  });
});

describe("keyboard and small screens", () => {
  test("skip link moves focus to the content without changing the page", () => {
    window.location.hash = "#/runs";
    render(<App />);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    // First in DOM order, so first in tab order.
    expect(document.body.querySelector("a")?.textContent).toBe(
      "Skip to content",
    );
    fireEvent.click(skip);
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(window.location.hash).toBe("#/runs");
  });

  test("menu toggle expands, collapses, and closes on navigation", async () => {
    render(<App />);
    const toggle = toggleButton();
    expect(toggle.getAttribute("aria-controls")).toBe("main-nav");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("main-nav")?.dataset.open).toBe("true");
    window.location.hash = "#/install";
    await waitFor(() =>
      expect(toggle.getAttribute("aria-expanded")).toBe("false"),
    );
  });

  test("CSS collapses the nav at 700px", () => {
    expect(appCss).toMatch(/@media \(max-width: 700px\)/);
    expect(appCss).toMatch(/\.nav-toggle\s*\{[^}]*display:\s*none/);
    expect(appCss).toMatch(/\[data-open="false"\]\s*\{[^}]*display:\s*none/);
  });
});
