"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGrid, Package, BarChart3 } from "lucide-react";

/**
 * Only covers destinations that actually exist (Sales/Inventory/Reports) —
 * the source design also shows an "Account" tab, but there's no account
 * screen in this app, so it's intentionally omitted rather than linking
 * to a page that doesn't exist.
 */
const TABS = [
  { href: "/", labelKey: "sales", icon: LayoutGrid, activeFor: ["/"] },
  {
    href: "/products",
    labelKey: "inventory",
    icon: Package,
    activeFor: ["/products", "/stock-update"],
  },
  { href: "/summary", labelKey: "reports", icon: BarChart3, activeFor: ["/summary"] },
] as const;

export function BottomNav() {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl">
        {TABS.map(({ href, labelKey, icon: Icon, activeFor }) => {
          const isActive = activeFor.some(
            (path) => pathname === path || pathname.startsWith(`${path}/`),
          );
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                isActive ? "text-green-500" : "text-zinc-500"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              {t(labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
