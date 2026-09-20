import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "24 Care",
    short_name: "24 Care",
    description: "A clinician-reviewed care intake workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#103c33",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
