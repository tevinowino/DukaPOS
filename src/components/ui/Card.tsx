/**
 * DukaPOS's dark theme mostly uses dark surface cards, but a handful of
 * focused single-task screens (PIN entry, confirming an AI product guess)
 * use a light "sheet" card instead — matching the shipped design, where
 * data-entry moments get a bright, high-contrast surface against the dark
 * app chrome, and everything else stays dark.
 */
export function Card({
  variant = "dark",
  className = "",
  children,
}: {
  variant?: "dark" | "light";
  className?: string;
  children: React.ReactNode;
}) {
  const base = "rounded-3xl";
  const theme =
    variant === "dark"
      ? "border border-zinc-800 bg-zinc-900/60"
      : "bg-white text-zinc-900 shadow-xl shadow-black/40";
  return <div className={`${base} ${theme} ${className}`.trim()}>{children}</div>;
}
