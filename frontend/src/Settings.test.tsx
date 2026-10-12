import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Settings from "./Settings";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("adds a folder via POST and lists it", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, [{ id: "1", path: "/a" }]))
    .mockResolvedValueOnce(jsonResponse(201, { id: "2", path: "/b" }));
  vi.stubGlobal("fetch", fetchMock);

  render(<Settings />);
  expect(await screen.findByText("/a")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Folder path"), {
    target: { value: "/b" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  expect(await screen.findByText("/b")).toBeTruthy();
  const [url, init] = fetchMock.mock.calls[1];
  expect(url).toBe("/api/folders");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ path: "/b" });
});

test("shows 422 reason inline and keeps list", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, [{ id: "1", path: "/a" }]))
    .mockResolvedValueOnce(
      jsonResponse(422, { detail: "path must be absolute" }),
    );
  vi.stubGlobal("fetch", fetchMock);

  render(<Settings />);
  expect(await screen.findByText("/a")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Folder path"), {
    target: { value: "rel" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("path must be absolute");
  expect(screen.queryByText("rel")).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
});
