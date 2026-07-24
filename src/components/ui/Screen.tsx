/**
 * Centers page content into a phone-width column and keeps it centered as
 * the viewport grows — this is a mobile-first shop-floor app, not a
 * desktop-native layout, so "looks good on desktop" means staying legible
 * and intentional at any width rather than stretching mobile UI edge to
 * edge. `size="wide"` gives dashboard-style screens (stat grids) a bit
 * more breathing room than single-column forms need.
 */
export function Screen({
  size = "narrow",
  padBottomNav = false,
  className = "",
  children,
}: {
  size?: "narrow" | "wide";
  /** Reserves space so BottomNav (fixed to the viewport bottom) never overlaps the last bit of content. */
  padBottomNav?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const maxWidth = size === "wide" ? "max-w-2xl" : "max-w-md";
  return (
    <main
      className={`mx-auto flex w-full ${maxWidth} flex-1 flex-col gap-4 px-4 py-6 ${padBottomNav ? "pb-24" : ""} ${className}`.trim()}
    >
      {children}
    </main>
  );
}
