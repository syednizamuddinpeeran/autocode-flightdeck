import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
    </div>
  );
}

/** Error text, announced to assistive tech. No prefix is added to the text. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="error-message">
      {children}
    </p>
  );
}

export function Loading({ children = "Loading..." }: { children?: string }) {
  return (
    <p role="status" className="loading">
      {children}
    </p>
  );
}
