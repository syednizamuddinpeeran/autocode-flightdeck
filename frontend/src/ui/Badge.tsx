export type BadgeTone = "neutral" | "success" | "warning" | "danger";

/** Status label. The meaning is the text; colour only reinforces it. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
