import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Next.js 16 blocks cross-origin requests to dev-only assets by default
  // (a real security feature, not a bug) — without this, accessing the
  // dev server through a tunnel like ngrok serves the initial server-
  // rendered HTML (so the header shows) but blocks every JS chunk needed
  // to hydrate anything below it, since the browser's requests come from
  // the tunnel's hostname, not `localhost`. Covers ngrok's current and
  // legacy domain suffixes; add your own here if you're using a custom
  // ngrok domain or a different tunneling service.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

export default withSerwist(withNextIntl(nextConfig));
