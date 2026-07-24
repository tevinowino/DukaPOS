/**
 * Shared className recipes for anything that looks like a button —
 * `<button>` elements and `<Link>`s alike (Next's `Link` can't be wrapped
 * in a `<Button>` component without extra polymorphism ceremony, so this
 * project centralizes the *style*, not the element).
 */

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-green-600 text-white hover:bg-green-500 active:bg-green-700",
  outline: "border border-zinc-700 text-zinc-100 hover:bg-zinc-800/60 active:bg-zinc-800",
  ghost: "text-zinc-400 hover:text-zinc-200 underline underline-offset-2",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3.5 text-base",
};

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "lg",
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}
