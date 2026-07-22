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
 */
const NAVIGATION_CACHE_NAMES = new Set(["pages-rsc-prefetch", "pages-rsc", "pages"]);
for (const entry of defaultCache) {
  if (entry.handler instanceof Strategy && NAVIGATION_CACHE_NAMES.has(entry.handler.cacheName)) {
    entry.handler.matchOptions = { ...entry.handler.matchOptions, ignoreSearch: true };
  }
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
