import type { MetadataRoute } from "next";

import { en } from "@/strings/en";

/**
 * Installable on a service point's tablet or desktop. Working through a
 * dropped connection (a service worker) comes with P6, at the service points
 * that need it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en.app.name,
    short_name: en.app.name,
    description: en.app.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
