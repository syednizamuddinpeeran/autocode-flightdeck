import type { ReactNode } from "react";

/**
 * Scroll container for a table. The container, not the page, scrolls on small
 * screens and in long lists, where the header row stays visible. It is
 * focusable so keyboard users can scroll it.
 */
export function TableWrap({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
