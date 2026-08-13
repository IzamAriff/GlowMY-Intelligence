import { callLlm, keysFromRequest } from "@/lib/llm";
import { G2G_SKUS } from "@/lib/g2gCatalog";
import { NextResponse } from "next/server";

const SYSTEM = `You are Luna, Glad2Glow's in-house website designer agent (Malaysia D2C skincare).
Return ONLY JSON:
{
  "designer": "Luna · Website Designer Agent",
  "concept": "short art direction",
  "hero": { "eyebrow":"", "headline":"", "sub":"", "cta":"", "cta2":"" },
  "story": "",
  "reviews": [ { "name":"", "city":"", "quote":"" } ],
  "badges": ["", "", ""]
}
Tone: girly, clean, bilingual-friendly (EN + a little BM). Palette is cream #FFF0E5, pink #FFC0CB, sage #B0C965, purple #9560E8.`;

function fallback() {
  return {
    designer: "Luna · Website Designer Agent",
    source: "designer-synthesis",
    concept: "Soft-girl derm-counter: pomegranate pink, centella sage, cream spa light.",
    hero: {
      eyebrow: "Malaysia’s pocket glass-skin lab",
      headline: "Glow that fits a student budget.",
      sub: "377 serum, pomegranate cream & blueberry SPF — Guardian-true prices from RM11.40. Made for humid KL skin.",
      cta: "Shop the 377 Serum · RM15",
      cta2: "Build a RM50 routine",
    },
    story:
      "Glad2Glow started as a TikTok-seeded lab in 2022. We pair fruit extracts with actives (niacinamide, 377, centella) so brightening and barrier care stay under RM20 on Shopee & Guardian MY.",
    reviews: [
      { name: "Aisyah", city: "Shah Alam", quote: "Pomegranate moisturizer RM15 je tapi texture dia spa gila. No white cast SPF pairing." },
      { name: "Mei Ling", city: "Penang", quote: "377 Yuja serum cleared my spots faster than my RM80 bottle." },
      { name: "Priya", city: "JB", quote: "Blueberry cleanser is the only gel that doesn’t strip in hostel AC." },
    ],
    badges: ["Guardian MY stocked", "SPF50 no white cast", "From RM11.40"],
    products: Object.values(G2G_SKUS).map((s) => ({
      name: s.product.name,
      price: s.g2gPrice,
      rrp: s.rrp,
    })),
  };
}

export async function POST(req) {
  const keys = keysFromRequest(req);
  const user = `Design a Glad2Glow MY storefront. Products: ${JSON.stringify(
    Object.values(G2G_SKUS).map((s) => ({ name: s.product.name, rm: s.g2gPrice }))
  )}`;
  let ai = null;
  let warning = "";
  try {
    ai = await callLlm({ system: SYSTEM, user, keys });
  } catch (e) {
    warning = e.message;
  }
  const payload = { ...fallback(), ...(ai || {}), generatedAt: new Date().toISOString() };
  if (ai) payload.source = "llm";
  if (warning) payload.warning = warning;
  return NextResponse.json(payload);
}
