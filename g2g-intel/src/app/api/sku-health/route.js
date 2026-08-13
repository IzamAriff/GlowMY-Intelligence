import { callLlm, keysFromRequest } from "@/lib/llm";
import { G2G_SKUS } from "@/lib/g2gCatalog";
import { NextResponse } from "next/server";

const SYSTEM = `You are Kai, Glad2Glow SKU Health analyst (MY D2C).
Return ONLY JSON:
{
  "agent":"Kai · SKU Health",
  "scores":[{"sku":"","name":"","demand":1-10,"margin":1-10,"competition":1-10,"contentFit":1-10,"overall":1-10,"verdict":"scale|hold|fix|harvest","moves":["",""]}],
  "watchouts":[""],
  "priorities":[""]
}`;

function fallback() {
  return {
    agent: "Kai · SKU Health",
    source: "health-synthesis",
    scores: [
      { sku: "serum", name: G2G_SKUS.serum.product.name, demand: 9, margin: 7, competition: 8, contentFit: 9, overall: 8.7, verdict: "scale", moves: ["Always-on 377 vs Skintific ads", "Add 30ml later"] },
      { sku: "moisturizer", name: G2G_SKUS.moisturizer.product.name, demand: 9, margin: 8, competition: 7, contentFit: 9, overall: 8.6, verdict: "scale", moves: ["Pink-jar UGC", "100g jumbo for AOV"] },
      { sku: "sunscreen", name: G2G_SKUS.sunscreen.product.name, demand: 8, margin: 7, competition: 9, contentFit: 10, overall: 8.3, verdict: "scale", moves: ["UV camera series", "Duo with cleanser"] },
      { sku: "cleanser", name: G2G_SKUS.cleanser.product.name, demand: 7, margin: 8, competition: 6, contentFit: 6, overall: 7.2, verdict: "hold", moves: ["Free-ship add-on", "Scent FAQ"] },
      { sku: "toner", name: G2G_SKUS.toner.product.name, demand: 6, margin: 7, competition: 7, contentFit: 5, overall: 6.3, verdict: "fix", moves: ["Seed 20 mid-tier creators", "7-day toner challenge"] },
    ],
    watchouts: [
      "Live extras at RM4.60 train customers to reject Guardian RM15.",
      "Toner has almost no review density vs serum.",
    ],
    priorities: [
      "Protect 377 serum stock through 11.11.",
      "Build toner social proof before 12.12.",
      "Never discount cleanser below RM9 — basket role.",
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
      user: `Score these SKUs: ${JSON.stringify(G2G_SKUS)}`,
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
