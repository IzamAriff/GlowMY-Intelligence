import { callLlm, keysFromRequest } from "@/lib/llm";
import { NextResponse } from "next/server";

const SYSTEM = `You are Reza, Glad2Glow weekly content desk for TikTok Shop MY.
Return ONLY JSON:
{
  "agent":"Reza · Content Desk",
  "weekOf":"ISO date",
  "northStar":"",
  "days":[{"day":"Mon","format":"","hook":"","sku":"","time":"","kpi":""}],
  "sounds":[""],
  "doNot":[""]
}
7 days. Mix BM/EN hooks.`;

function fallback() {
  const weekOf = new Date().toISOString().slice(0, 10);
  return {
    agent: "Reza · Content Desk",
    source: "content-synthesis",
    weekOf,
    northStar: "Drive 377 serum + pink jar as the RM30 glass-skin pair.",
    days: [
      { day: "Mon", format: "UV camera", hook: "SPF murah boleh tahan matahari PJ?", sku: "Sunscreen", time: "12:30", kpi: "Saves" },
      { day: "Tue", format: "3-day barrier", hook: "Day 1 vs Day 3 redness close-up", sku: "Centella gel", time: "20:30", kpi: "Comments GLOW" },
      { day: "Wed", format: "Price contrast", hook: "RM15 vs RM80 377 — jujur ke?", sku: "Serum", time: "13:00", kpi: "CTR yellow basket" },
      { day: "Thu", format: "Hostel routine", hook: "Budget RM50 full set, no cap", sku: "Trio", time: "21:00", kpi: "Bundle ATC" },
      { day: "Fri", format: "Live 90 min", hook: "Flash cleanser + SPF duo", sku: "Duo", time: "20:00", kpi: "GMV" },
      { day: "Sat", format: "Unbox ASMR", hook: "Pink jar spatula hitting", sku: "Moisturizer", time: "16:00", kpi: "Follows" },
      { day: "Sun", format: "FAQ stitch", hook: "Kenapa 17ml? Here's 14-day use", sku: "Serum", time: "11:30", kpi: "Trust comments" },
    ],
    sounds: ["Aesthetic Soft Vibe MY Remix", "Kulit breakout sebab barrier?", "Speed-up beauty DJ"],
    doNot: ["Never bash Skintific by name in ads", "Don't show RM4.60 live price on Guardian creative"],
  };
}

export async function POST(req) {
  const keys = keysFromRequest(req);
  let ai = null;
  let warning = "";
  try {
    ai = await callLlm({
      system: SYSTEM,
      user: `Plan week of ${new Date().toISOString()} for Glad2Glow MY.`,
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
