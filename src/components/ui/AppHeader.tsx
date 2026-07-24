import { Store } from "lucide-react";
import { LocaleToggle } from "../LocaleToggle";

/**
 * The persistent top bar (wordmark + locale toggle) shown on every screen,
 * in every `AppLockGate` state — a single deep component rather than each
 * page rebuilding its own header, per this project's "no temporal
 * decomposition" convention.
 */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600">
          <Store size={18} className="text-white" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">DukaPOS</span>
      </div>
      <LocaleToggle />
    </header>
  );
}
