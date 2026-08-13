import { callLlm, keysFromRequest } from "@/lib/llm";
import { NextResponse } from "next/server";

const SYSTEM = `You are Nia, Glad2Glow bundle & AOV architect for Shopee/TikTok MY.
Return ONLY JSON:
{
  "agent":"Nia · Bundle & AOV",
  "targetAov": number,
  "bundles":[{"name":"","skus":[""],"price":0,"saveVsSolo":0,"who":"","hook":"","marginNote":""}],
  "thresholds":[{"cart":0,"unlock":""}],
  "tests":[""]
}`;

function fallback() {
  return {
    agent: "Nia · Bundle & AOV",
    source: "bundle-synthesis",
    targetAov: 48,
    bundles: [
      { name: "Hostel Starter (3)", skus: ["Cleanser", "Centella gel", "SPF"], price: 34.9, saveVsSolo: 7.2, who: "Students, first purchase", hook: "Full AM under RM35", marginNote: "Hold ≥58% before ads" },
      { name: "Glass-skin Desk (4)", skus: ["Cleanser", "Toner", "377 serum", "Pomegranate cream"], price: 49.9, saveVsSolo: 9.45, who: "Working women 22–28", hook: "Office AC + Grab humidity", marginNote: "Hero AOV ladder" },
      { name: "UV Camera Duo", skus: ["SPF", "Pomegranate cream"], price: 26.9, saveVsSolo: 3.4, who: "TikTok live impulse", hook: "No white cast + pink jar", marginNote: "Live extra floor RM24" },
      { name: "Lebaran Open House", skus: ["Serum", "Cream", "SPF", "mini micellar"], price: 48.0, saveVsSolo: 12, who: "Raya gifting", hook: "Sampul + 4-in-1", marginNote: "22% off max" },
    ],
    thresholds: [
      { cart: 40, unlock: "Free shipping (standard MY)" },
      { cart: 55, unlock: "Mini spatula + sampul" },
      { cart: 79, unlock: "Travel SPF 10g" },
    ],
    tests: [
      "A/B serum+cream RM27.90 vs RM29.90 on TikTok live.",
      "Shopee coins hour: unlock free shipping at RM35 for 2 hours only.",
    ],
  };
}

export async function POST(req) {
  const keys = keysFromRequest(req);
  let ai = null;
  let warning = "";
  try {
    ai = await callLlm({
      system: SYSTEM,
      user: "Design MY bundles using G2G street prices RM11.40–15.30.",
      keys,
    });
  } catch (e) {
    warning = e.message;
  }
  const payload = { ...fallback(), ...(ai || {}), generatedAt: new Date().toISOString() };
  if (ai) payload.source = "llm";
  if (warning) payload.warning = warning;
  return NextResponse.json(payload);
}
