import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  isIconOnly?: boolean;
  fullWidth?: boolean;
};

/**
 * HeroUI-styled button rendered as a plain <button>.
 *
 * It uses HeroUI's documented BEM classes (`.button`, `.button--primary`, ...) so it is
 * pixel-identical to `<Button>` from @heroui/react, but ships zero JavaScript. We use it on
 * the shop's hot path (20+ "Add" buttons + category chips) to keep react-aria out of the
 * initial bundle; the full `<Button>` component is still used inside the lazy cart drawer.
 */
export function PillButton({
  variant = "primary",
  size = "md",
  isIconOnly = false,
  fullWidth = false,
  className,
  type = "button",
  ...rest
}: Props) {
  const cls = [
    "button",
    `button--${variant}`,
    `button--${size}`,
    isIconOnly && "button--icon-only",
    fullWidth && "button--full-width",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={cls} {...rest} />;
}
