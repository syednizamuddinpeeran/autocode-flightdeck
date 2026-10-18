import type { ReactNode } from "react";

/** Page title (an h2: the app shell owns the h1) with optional actions. */
export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <h2>{title}</h2>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
