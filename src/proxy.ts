import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function
 * must be named/exported as `proxy`, not `middleware` — see
 * ARCHITECTURE.md ADR-6 for why next-intl still works unchanged here).
 */
export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
