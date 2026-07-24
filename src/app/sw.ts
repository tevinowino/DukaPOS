import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, Strategy } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Next's client router appends a `_rsc=<nonce>` query param to RSC fetches
 * that is *not* stable across separate navigations to the same route.
 * `defaultCache`'s NetworkFirst handlers for RSC/HTML navigations cache by
 * exact URL (no `ignoreSearch`) and set no `networkTimeoutSeconds`, so a
 * route cached from one online visit can miss on a later offline visit
 * (different `_rsc` value) and then just hang — proven live via a Cache
 * Storage dump during this phase's "sweep for offline dead-ends" (see
 * overview.md): `/products` was cached under `pages-rsc` keyed by one
 * `_rsc` value, then a fresh offline navigation to the same route, with a
 * different `_rsc` value, missed that entry and never fell back.
 * `ignoreSearch: true` makes the cache lookup match on pathname alone,
 * fixing this without touching any of `defaultCache`'s other tuning
 * (expiration, plugins, etc. all pass through the untouched instances).
 *
 * `ignoreSearch` alone turned out not to be sufficient (found live: a
 * direct `cache.match(url, {ignoreSearch: true})` against a real cached
 * RSC entry still returned no match). Next's RSC responses carry a
 * `Vary` header (they differ by request headers like `RSC` /
 * `Next-Router-State-Tree`, not just the URL), and the Cache API's
 * `ignoreSearch` only affects the URL comparison — it still enforces
 * `Vary`-listed request headers matching unless `ignoreVary` is also
 * set. `ignoreVary: true` makes the lookup match on pathname alone,
 * regardless of which request headers produced the cached entry.
 */
const NAVIGATION_CACHE_NAMES = new Set(["pages-rsc-prefetch", "pages-rsc", "pages"]);
for (const entry of defaultCache) {
  if (entry.handler instanceof Strategy && NAVIGATION_CACHE_NAMES.has(entry.handler.cacheName)) {
    entry.handler.matchOptions = {
      ...entry.handler.matchOptions,
      ignoreSearch: true,
      ignoreVary: true,
    };
  }
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

/**
 * Every route is dynamic (server-rendered per request — there is no
 * static HTML/RSC payload for any of them to precache), so a route the
 * shopkeeper has genuinely never opened before has nothing cached for the
 * `ignoreSearch` fix above to find either — proven live (Phase 10
 * hardening): a fresh offline navigation to an unvisited route hung
 * indefinitely, distinct from the already-fixed "visited once, but with a
 * different `_rsc` nonce" case.
 *
 * `NetworkFirst` documents that it throws once both the network and the
 * cache miss — exactly this case — so `setCatchHandler` (which only fires
 * on that throw, unlike `navigateFallback`'s `NavigationRoute`, which
 * would unconditionally intercept *every* navigation including normal
 * online ones) is the correct, narrowly-scoped place to catch it: fall
 * back to the static, precached `offline.html` shell instead of hanging
 * forever. This is a degraded experience (lands on a generic screen, not
 * the requested one), not a fix for "every route works offline" — that
 * would need precaching each route's actual data, which isn't possible
 * for server-rendered content with no static build output.
 */
serwist.setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    return (await serwist.matchPrecache("/offline.html")) ?? Response.error();
  }
  return Response.error();
});

serwist.addEventListeners();
