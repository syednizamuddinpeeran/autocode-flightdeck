// Tiny hash router: the page is chosen by location.hash, so reload and
// back/forward work without a router dependency.

export type PageId =
  "sessions" | "guard" | "runs" | "harness" | "trends" | "install" | "settings";

export const PAGES: readonly { id: PageId; label: string }[] = [
  { id: "sessions", label: "Sessions" },
  { id: "guard", label: "Guard" },
  { id: "runs", label: "Runs" },
  { id: "harness", label: "Harness" },
  { id: "trends", label: "Trends" },
  { id: "install", label: "Install" },
  { id: "settings", label: "Settings" },
];

export const DEFAULT_PAGE: PageId = "sessions";

export function hrefFor(id: PageId): string {
  return `#/${id}`;
}

/**
 * Which page a hash selects. Besides `#/<page>`, two older links keep working:
 * `#session=<repo>/<id>` (session timeline, on Sessions) and `#settings`.
 * Anything else is the default page.
 */
export function parseRoute(hash: string): PageId {
  if (hash.startsWith("#session=")) return "sessions";
  const name = hash.replace(/^#\/?/, "");
  const page = PAGES.find((p) => p.id === name);
  return page ? page.id : DEFAULT_PAGE;
}
