import type { Metadata } from "next";

const PAGES = {
  talk: { title: "Talk · Bespoke studio", description: "Describe the garment you want in English or Hinglish, typed or spoken. The studio asks only what is missing." },
  board: { title: "Moodboard · Bespoke studio", description: "Pin pictures of what you love, circle the details, and the studio reads them into your design." },
  sheet: { title: "Tailor sheet · Bespoke studio", description: "Your design as a tailor sheet in English or Hindi, with drawings and your measurements." },
  shop: { title: "Shop · Bespoke studio", description: "Searches written from your design and who it is for, on the shops' own sites." },
} as const;
type View = keyof typeof PAGES;

export const dynamicParams = false;
export function generateStaticParams() {
  return (Object.keys(PAGES) as View[]).map((view) => ({ view }));
}

export async function generateMetadata({ params }: { params: Promise<{ view: View }> }): Promise<Metadata> {
  const { view } = await params;
  return { ...PAGES[view], alternates: { canonical: `/studio/${view}/` } };
}

// the studio itself is in the layout; each page only names itself
export default function Page() {
  return null;
}
