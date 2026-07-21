import type { MetadataRoute } from "next";

// Placeholder icons for the hackathon build — real branding is out of
// scope until Phase 9 (see plan/phase-09-localization-and-pwa-polish).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DukaPOS",
    short_name: "DukaPOS",
    description: "Offline-first stock and sales tracking for small shops",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
