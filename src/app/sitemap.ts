import type { MetadataRoute } from "next";
import { site } from "@/data/event";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: site.url,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${site.url}/igra`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
