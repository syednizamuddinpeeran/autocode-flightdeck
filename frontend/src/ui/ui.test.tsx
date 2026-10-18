import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import rawCss from "./ui.css?raw";
import rawTheme from "../theme.css?raw";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Loading,
  PageHeader,
  TableWrap,
} from ".";

afterEach(cleanup);

describe("components render", () => {
  test("Card wraps its children", () => {
    render(<Card>inside</Card>);
    expect(screen.getByText("inside").className).toBe("card");
  });

  test("PageHeader is an h2 with optional actions", () => {
    render(<PageHeader title="Runs" actions={<button>Refresh</button>} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Runs" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  test("PageHeader without actions renders no actions container", () => {
    const { container } = render(<PageHeader title="Runs" />);
    expect(container.querySelector(".page-header-actions")).toBeNull();
  });

  test.each(["neutral", "success", "warning", "danger"] as const)(
    "Badge %s shows its meaning as text",
    (tone) => {
      render(<Badge tone={tone}>{`status ${tone}`}</Badge>);
      const el = screen.getByText(`status ${tone}`);
      expect(el.className).toContain(`badge-${tone}`);
      expect(el.textContent?.length).toBeGreaterThan(0);
    },
  );

  test("Badge defaults to neutral", () => {
    render(<Badge>pass</Badge>);
    expect(screen.getByText("pass").className).toContain("badge-neutral");
  });

  test.each(["primary", "secondary", "danger"] as const)(
    "Button %s variant",
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole("button", { name: "Go" }).className).toContain(
        `btn-${variant}`,
      );
    },
  );

  test("Button is secondary and type=button by default, and can be disabled", () => {
    render(
      <>
        <Button>Plain</Button>
        <Button disabled>Off</Button>
        <Button type="submit">Send</Button>
      </>,
    );
    const plain = screen.getByRole("button", { name: "Plain" });
    expect(plain.className).toContain("btn-secondary");
    expect(plain.getAttribute("type")).toBe("button");
    expect(
      (screen.getByRole("button", { name: "Off" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Send" }).getAttribute("type"),
    ).toBe("submit");
  });

  test("Field labels its control and shows a hint", () => {
    render(
      <Field label="Folder path" hint="Absolute path">
        <input />
      </Field>,
    );
    expect(screen.getByLabelText(/Folder path/)).toBeTruthy();
    expect(screen.getByText("Absolute path")).toBeTruthy();
  });

  test("EmptyState shows title and message", () => {
    render(<EmptyState title="Nothing yet">Add a folder.</EmptyState>);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Add a folder.")).toBeTruthy();
  });

  test("ErrorMessage is an alert with exactly the given text", () => {
    render(<ErrorMessage>path must be absolute</ErrorMessage>);
    expect(screen.getByRole("alert").textContent).toBe("path must be absolute");
  });

  test("Loading is a status with the existing default text", () => {
    render(<Loading />);
    expect(screen.getByRole("status").textContent).toBe("Loading...");
    cleanup();
    render(<Loading>Fetching runs</Loading>);
    expect(screen.getByRole("status").textContent).toBe("Fetching runs");
  });

  test("TableWrap is a labelled, focusable scroll region around the table", () => {
    render(
      <TableWrap label="Runs table">
        <table>
          <tbody>
            <tr>
              <td>x</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>,
    );
    const region = screen.getByRole("region", { name: "Runs table" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.querySelector("table")).not.toBeNull();
  });
});

describe("ui.css", () => {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const theme = rawTheme.replace(/\/\*[\s\S]*?\*\//g, "");

  test("uses theme tokens only: no colour literals", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });

  test("only references tokens that theme.css defines", () => {
    const defined = new Set(
      [...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const t of used) expect(defined.has(t), t).toBe(true);
  });

  test("styles every tone, variant and state", () => {
    for (const sel of [
      ".badge-success",
      ".badge-warning",
      ".badge-danger",
      ".btn-primary",
      ".btn-secondary",
      ".btn-danger",
      ".btn:disabled",
      ".field",
      ".empty-state",
      ".error-message",
      ".loading",
    ]) {
      expect(css, sel).toContain(sel);
    }
  });

  test("tables scroll inside their container and keep the header sticky", () => {
    expect(css).toMatch(/\.table-wrap\s*\{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/\.table-wrap thead th\s*\{[^}]*position:\s*sticky/);
  });

  test("only pairs text and background tokens that are contrast-checked", () => {
    // theme.test.ts / palettes check these pairs at 4.5:1.
    const allowed = new Set([
      "--color-text/--color-surface",
      "--color-text-muted/--color-surface",
      "--color-on-accent/--color-accent",
      "--color-on-success/--color-success",
      "--color-on-warning/--color-warning",
      "--color-on-danger/--color-danger",
    ]);
    for (const [, body] of css.matchAll(/\{([^}]*)\}/g)) {
      const fg = /(?:^|;|\s)color:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      const bg = /background:\s*var\((--[a-z-]+)\)/.exec(body)?.[1];
      if (fg && bg)
        expect(allowed.has(`${fg}/${bg}`), `${fg}/${bg}`).toBe(true);
    }
  });
});
