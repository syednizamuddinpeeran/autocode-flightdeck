import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export function Button({
  variant = "secondary",
  type = "button",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const classes = ["btn", `btn-${variant}`, className].filter(Boolean);
  return <button type={type} className={classes.join(" ")} {...rest} />;
}
