import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/orders/"] }],
    sitemap: "https://onestyle-tawny.vercel.app/sitemap.xml",
    host: "https://onestyle-tawny.vercel.app",
  };
}
