import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE = "https://onestyle-tawny.vercel.app";
const PAGES: [string, number][] = [["/", 1], ["/studio/", 0.9], ["/about/", 0.8], ["/makers/", 0.7], ["/login/", 0.3], ["/signup/", 0.4]];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({ url: `${SITE}${path}`, lastModified: new Date(), changeFrequency: "weekly", priority }));
}
