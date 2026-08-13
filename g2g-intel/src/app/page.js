"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { Bar, Scatter } from "react-chartjs-2";
import { ensureG2G, isG2G, G2G_SKUS } from "@/lib/g2gCatalog";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, Tooltip, Legend, Title, annotationPlugin);

const CACHE_KEY = "g2g-intel-cache-v4";
const KEYS_KEY = "g2g-api-keys";
const AUTH_KEY = "g2g-admin-session";
const CREDS_KEY = "g2g-admin-creds";
const DEFAULT_USER = "admin";
const DEFAULT_PASS = "g2gadmin";

const AGENTS = [
  { id: "home", name: "Ops", role: "Command", blurb: "Desk overview", icon: "◈", tint: "#9560E8", img: "/logo-mark.jpg" },
  { id: "trend", name: "Aria", role: "Trend Scan", blurb: "TikTok + Shopee MY", icon: "↗", tint: "#c084fc", img: "/icon-aria.jpg" },
  { id: "price", name: "Leo", role: "Price Optimiser", blurb: "Street prices + calc", icon: "RM", tint: "#B0C965", img: "/icon-leo.jpg" },
  { id: "voc", name: "Mira", role: "VOC & Sentiment", blurb: "Reviews & complaints", icon: "♥", tint: "#FF8FAB", img: "/icon-mira.jpg" },
  { id: "health", name: "Kai", role: "SKU Health", blurb: "Scale / fix / hold", icon: "◆", tint: "#7C3AED", img: "/icon-kai.jpg" },
  { id: "bundle", name: "Nia", role: "Bundle & AOV", blurb: "Sets that clear RM40", icon: "▣", tint: "#FB7185", img: "/icon-nia.jpg" },
  { id: "content", name: "Reza", role: "Content Desk", blurb: "7-day posting plan", icon: "✎", tint: "#F59E0B", img: "/icon-reza.jpg" },
];

const SKU_IMG = {
  serum: "/serum.jpg",
  moisturizer: "/pom.jpg",
  sunscreen: "/spf.jpg",
  cleanser: "/cleanser.jpg",
  toner: "/centella.jpg",
};

const SKUS = ["serum", "moisturizer", "sunscreen", "cleanser", "toner"];

function getCreds() {
  try {
    return { user: DEFAULT_USER, pass: DEFAULT_PASS, ...JSON.parse(localStorage.getItem(CREDS_KEY) || "{}") };
  } catch {
    return { user: DEFAULT_USER, pass: DEFAULT_PASS };
  }
}

function statsFor(sku) {
  if (!sku) return null;
  const prices = sku.competitors.map((c) => Number(c.price)).filter((n) => !Number.isNaN(n));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const g2g = Number(sku.g2gPrice);
  const below = ((avg - g2g) / avg) * 100;
  return { min, max, avg, median, g2g, below };
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-MY", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export default function Command() {
  const [authed, setAuthed] = useState(false);
  const [login, setLogin] = useState({ user: "", pass: "" });
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("home");
  const [keys, setKeys] = useState({ openai: "", gemini: "", search: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [trend, setTrend] = useState(null);
  const [price, setPrice] = useState(null);
  const [voc, setVoc] = useState(null);
  const [health, setHealth] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [content, setContent] = useState(null);
  const [skuId, setSkuId] = useState("serum");
  const [calc, setCalc] = useState({ cogs: 5.2, fee: 8, ads: 12, margin: 62, testPrice: 15 });
  const abortRef = useRef(null);
  const haltRef = useRef(false);

  useEffect(() => {
    try {
      setKeys({ openai: "", gemini: "", search: "", ...JSON.parse(localStorage.getItem(KEYS_KEY) || "{}") });
    } catch {
      /* */
    }
    if (sessionStorage.getItem(AUTH_KEY) === "1") setAuthed(true);
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c?.trend) setTrend(c.trend);
      if (c?.price) setPrice(ensureG2G(c.price));
      if (c?.voc) setVoc(c.voc);
      if (c?.health) setHealth(c.health);
      if (c?.bundle) setBundle(c.bundle);
      if (c?.content) setContent(c.content);
    } catch {
      /* */
    }
  }, []);

  const hdr = useCallback(() => {
    const h = { "Content-Type": "application/json" };
    if (keys.openai) h["x-openai-key"] = keys.openai;
    if (keys.gemini) h["x-gemini-key"] = keys.gemini;
    if (keys.search) h["x-search-key"] = keys.search;
    return h;
  }, [keys]);

  const persist = (patch) => {
    const prev = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...patch, at: Date.now() }));
  };

  const run = async (id) => {
    const map = {
      trend: ["/api/trend-scan", setTrend, "trend"],
      price: ["/api/price-review", (d) => setPrice(ensureG2G(d)), "price"],
      voc: ["/api/sentiment", setVoc, "voc"],
      health: ["/api/sku-health", setHealth, "health"],
      bundle: ["/api/bundles", setBundle, "bundle"],
      content: ["/api/content-desk", setContent, "content"],
    };
    const spec = map[id];
    if (!spec) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(spec[0], { method: "POST", headers: hdr() });
      const json = await res.json();
      if (json.warning) setError(json.warning);
      spec[1](json);
      persist({ [spec[2]]: spec[0].includes("price") ? ensureG2G(json) : json });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const runAll = async () => {
    setLoading(true);
    for (const id of ["trend", "price", "voc", "health", "bundle", "content"]) {
      // eslint-disable-next-line no-await-in-loop
      await run(id);
    }
    setLoading(false);
  };

  const doLogin = (e) => {
    e.preventDefault();
    const c = getCreds();
    if (login.user.trim() === c.user && login.pass === c.pass) {
      sessionStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
    } else setLoginErr("Wrong username or password.");
  };

  const sku = price?.skus?.[skuId];
  const stats = useMemo(() => statsFor(sku), [sku]);

  useEffect(() => {
    if (!sku) return;
    const p = Number(sku.g2gPrice) || 15;
    setCalc((c) => ({ ...c, cogs: +(p * 0.38).toFixed(2), testPrice: p }));
  }, [skuId, sku?.g2gPrice]);

  const calcOut = useMemo(() => {
    const sell = Number(calc.testPrice) || 0;
    const cogs = Number(calc.cogs) || 0;
    const fee = (sell * Number(calc.fee || 0)) / 100;
    const ads = (sell * Number(calc.ads || 0)) / 100;
    const net = sell - cogs - fee - ads;
    const denom = 1 - (Number(calc.fee) + Number(calc.ads) + Number(calc.margin)) / 100;
    const suggested = denom > 0.05 ? cogs / denom : sell;
    return { sell, fee, ads, net, netPct: sell ? (net / sell) * 100 : 0, suggested };
  }, [calc]);

  const barData = useMemo(() => {
    if (!sku) return null;
    const sorted = [...sku.competitors].sort((a, b) => a.price - b.price);
    return {
      labels: sorted.map((c) => c.brand),
      datasets: [
        {
          data: sorted.map((c) => c.price),
          backgroundColor: sorted.map((c) => (isG2G(c) ? "#9560E8" : "#B0C965")),
          borderRadius: 8,
          barThickness: 14,
        },
      ],
    };
  }, [sku]);

  const scatterData = useMemo(() => {
    if (!sku) return null;
    return {
      datasets: [
        {
          data: sku.competitors.map((c) => ({ x: +c.price, y: +(c.quality || 7), brand: c.brand })),
          backgroundColor: sku.competitors.map((c) => (isG2G(c) ? "#9560E8" : "#B0C965")),
          pointRadius: sku.competitors.map((c) => (isG2G(c) ? 11 : 6)),
        },
      ],
    };
  }, [sku]);

  const status = {
    trend: !!trend,
    price: !!price,
    voc: !!voc,
    health: !!health,
    bundle: !!bundle,
    content: !!content,
  };
  const readyCount = Object.values(status).filter(Boolean).length;
  const active = AGENTS.find((a) => a.id === tab) || AGENTS[0];

  if (!authed) {
    return (
      <div className="min-h-screen mesh grid lg:grid-cols-2">
        <div className="relative hidden lg:block overflow-hidden">
          <img src="/hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#3b2060] via-[#3b2060]/50 to-transparent" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <p className="text-xs tracking-[0.28em] uppercase text-[#FFC0CB]">Glad2Glow Malaysia</p>
            <h1 className="font-heading text-5xl mt-2 leading-tight">Six agents watching one brand.</h1>
            <p className="mt-3 text-white/80 max-w-md">
              Trend, price, voice-of-customer, SKU health, bundles and a weekly content desk — in one staff console.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center p-6">
          <form onSubmit={doLogin} className="w-full max-w-md glass rounded-[28px] p-9">
            <div className="flex items-center gap-3 mb-6">
              <img src="/logo-mark.jpg" alt="" className="w-12 h-12 rounded-2xl object-cover shadow" />
              <div>
                <div className="font-heading text-xl leading-none">Command Center</div>
                <div className="text-xs text-[#9560E8] mt-1">Staff desk · MY D2C</div>
              </div>
            </div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username</label>
            <input
              className="w-full mt-1 mb-4 rounded-2xl border border-[#FFB6C1] bg-white/80 px-4 py-3 text-sm"
              value={login.user}
              onChange={(e) => setLogin((s) => ({ ...s, user: e.target.value }))}
            />
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              className="w-full mt-1 mb-4 rounded-2xl border border-[#FFB6C1] bg-white/80 px-4 py-3 text-sm"
              value={login.pass}
              onChange={(e) => setLogin((s) => ({ ...s, pass: e.target.value }))}
            />
            {loginErr && <p className="text-xs text-red-600 mb-3">{loginErr}</p>}
            <button className="w-full py-3.5 rounded-2xl bg-[#9560E8] text-white font-semibold shadow-lg shadow-purple-300/50">
              Enter the desk
            </button>
            <p className="text-[11px] text-slate-400 mt-4 text-center">Default · admin / g2gadmin</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mesh text-[#3b2060] flex">
      <aside className="hidden lg:flex w-[272px] shrink-0 flex-col sticky top-0 h-screen bg-[#2a1544] text-white">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <img src="/logo-mark.jpg" alt="Glad2Glow" className="w-10 h-10 rounded-2xl object-cover ring-2 ring-[#9560E8]/40" />
            <div>
              <div className="font-heading text-lg leading-none">Glad2Glow</div>
              <div className="text-[11px] text-[#FFC0CB] mt-1">Intelligence OS</div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-white/8 border border-white/10 p-3">
            <div className="flex justify-between text-[11px] text-white/60">
              <span>Agents live</span>
              <span className="text-[#B0C965] font-semibold">{readyCount}/6</span>
            </div>
            <div className="bar mt-2 bg-white/10">
              <i style={{ width: `${(readyCount / 6) * 100}%` }} />
            </div>
          </div>
        </div>
        <nav className="px-3 flex-1 overflow-y-auto space-y-1 pb-4">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setTab(a.id)}
              className={`w-full text-left px-3 py-2.5 rounded-2xl flex gap-3 items-center transition ${
                tab === a.id ? "bg-white text-[#3b2060] shadow-lg" : "hover:bg-white/8 text-white/80"
              }`}
            >
              <img
                src={a.img}
                alt=""
                className={`w-9 h-9 rounded-xl object-cover shrink-0 ${tab === a.id ? "ring-2 ring-[#9560E8]" : "opacity-90"}`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{a.role}</span>
                <span className={`block text-[11px] truncate ${tab === a.id ? "text-slate-500" : "text-white/45"}`}>
                  {a.name}
                  {a.id !== "home" && (status[a.id] ? " · ready" : " · idle")}
                </span>
              </span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/55 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#9560E8] text-white flex items-center justify-center font-bold">A</span>
            <div>
              <div className="text-white font-semibold">admin</div>
              <div>Malaysia desk</div>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="text-[#FFC0CB]">
            API keys & settings
          </button>
          <button
            className="block"
            onClick={() => {
              sessionStorage.removeItem(AUTH_KEY);
              location.reload();
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 glass px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#9560E8] font-semibold">
              {active.name} · agent
            </div>
            <div className="font-heading text-xl truncate">{active.role}</div>
          </div>
          <div className="flex items-center gap-2">
            {busy && (
              <span className="text-xs text-[#9560E8] animate-pulse">Consulting {busy}…</span>
            )}
            {(busy || loading) && (
              <button
                onClick={stop}
                className="px-4 py-2.5 rounded-2xl bg-white border border-red-300 text-red-700 text-xs font-semibold"
              >
                Stop
              </button>
            )}
            <button
              onClick={runAll}
              disabled={loading || !!busy}
              className="px-4 py-2.5 rounded-2xl bg-[#3b2060] text-white text-xs font-semibold shadow-md disabled:opacity-60"
            >
              {loading ? "Desk running…" : "Refresh all agents"}
            </button>
          </div>
        </header>

        <div className="lg:hidden flex gap-2 overflow-x-auto px-3 py-2">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setTab(a.id)}
              className={`pl-1.5 pr-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                tab === a.id ? "bg-[#9560E8] text-white" : "bg-white border border-[#FFC0CB]"
              }`}
            >
              <img src={a.img} alt="" className="w-5 h-5 rounded-full object-cover" />
              {a.role}
            </button>
          ))}
        </div>

        <main className="p-4 sm:p-7 max-w-[1280px] w-full mx-auto space-y-6">
          {error && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-sm px-4 py-3">{error}</div>
          )}

          {tab === "home" && (
            <div className="space-y-6">
              <section className="relative overflow-hidden rounded-[32px] bg-[#3b2060] text-white p-8 md:p-10">
                <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-[#9560E8]/50 blur-3xl" />
                <div className="absolute right-10 bottom-0 w-40 h-40 rounded-full bg-[#FF8FAB]/40 blur-2xl" />
                <p className="text-xs tracking-[0.25em] uppercase text-[#FFC0CB]">Today on the desk</p>
                <h1 className="font-heading text-4xl md:text-5xl mt-2 max-w-xl leading-[1.05]">
                  Close the gap with GlowMY — without guessing.
                </h1>
                <p className="mt-4 max-w-lg text-white/75">
                  Aria, Leo, Mira, Kai, Nia and Reza each own a slice of the brand. Run the desk, then drill into any
                  workspace.
                </p>
                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Agents ready", `${readyCount} / 6`],
                    ["Street hero", "RM15.00 serum"],
                    ["Target AOV", "RM48"],
                    ["GMV gap", "RM135k / mo"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-2xl bg-white/10 border border-white/10 p-4">
                      <div className="text-[11px] text-white/60">{l}</div>
                      <div className="font-heading text-2xl mt-1">{v}</div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {AGENTS.filter((a) => a.id !== "home").map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setTab(a.id)}
                    className="glass rounded-[24px] p-5 text-left hover:-translate-y-0.5 transition group"
                  >
                    <div className="flex items-start justify-between">
                      <img src={a.img} alt={a.name} className="w-14 h-14 rounded-2xl object-cover shadow-md" />
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                          status[a.id] ? "bg-[#E8F5C8] text-[#3f6212]" : "bg-[#FFF0E5] text-slate-400"
                        }`}
                      >
                        {status[a.id] ? "Ready" : "Idle"}
                      </span>
                    </div>
                    <div className="mt-4 text-xs font-bold text-[#9560E8]">{a.name}</div>
                    <div className="font-heading text-2xl">{a.role}</div>
                    <p className="text-sm text-slate-500 mt-1">{a.blurb}</p>
                    <div className="mt-4 text-xs font-semibold text-[#9560E8] group-hover:underline">Open workspace →</div>
                  </button>
                ))}
              </div>

              <div>
                <h3 className="font-heading text-xl mb-3">Live street book</h3>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {Object.entries(G2G_SKUS).map(([k, s]) => (
                    <div key={k} className="glass rounded-2xl overflow-hidden">
                      <img src={SKU_IMG[k]} alt="" className="h-24 w-full object-cover" />
                      <div className="p-4">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
                        <div className="font-heading text-2xl text-[#9560E8] mt-1">RM{s.g2gPrice.toFixed(2)}</div>
                        <div className="text-[11px] text-slate-500 line-through">RRP {s.rrp.toFixed(2)}</div>
                        <p className="text-[11px] mt-2 line-clamp-2 text-slate-600">{s.product.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "trend" && (
            <Workspace
              agent="Aria"
              img="/icon-aria.jpg"
              title="What’s moving on MY TikTok & Shopee"
              meta={trend?.generatedAt}
              source={trend?.source}
              onRun={() => run("trend")}
              onStop={stop}
              busy={busy === "trend"}
              hasData={!!trend}
            >
              {!trend ? (
                <Empty onRun={() => run("trend")} />
              ) : (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {(trend.trends || []).map((t) => (
                      <article key={t.rank} className="glass rounded-[22px] p-4 flex flex-col">
                        <div className="flex items-center justify-between">
                          <span className="w-8 h-8 rounded-full bg-[#9560E8] text-white text-xs font-bold flex items-center justify-center">
                            {t.rank}
                          </span>
                          <span className="text-[11px] text-slate-400">{t.avgViews}</span>
                        </div>
                        <h4 className="font-heading text-lg mt-3 leading-snug">{t.format}</h4>
                        <p className="text-xs text-slate-500 mt-2 flex-1">{t.description}</p>
                        <div className="mt-3 pt-3 border-t border-[#FFC0CB]/60 text-[11px]">
                          <div className="text-[#9560E8] truncate">♪ {t.viralSound}</div>
                          <div className="text-slate-400 truncate">{t.hashtags}</div>
                          {t.tip && <div className="mt-2 italic text-slate-600">{t.tip}</div>}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="grid lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-5 glass rounded-[22px] p-5">
                      <h3 className="font-heading text-lg mb-3">Shopee keyword tape</h3>
                      {(trend.keywords || []).map((k) => (
                        <div key={k.rank} className="flex items-center gap-3 py-2.5 border-t border-[#FFF0E5]">
                          <span className="text-[#9560E8] font-bold w-6">#{k.rank}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{k.keyword}</div>
                            <div className="text-[11px] text-slate-400">{k.volume} · {k.searches?.toLocaleString?.() || ""}</div>
                          </div>
                          <span className="text-emerald-600 text-xs font-bold">{k.trend}</span>
                        </div>
                      ))}
                    </div>
                    <div className="lg:col-span-7 grid sm:grid-cols-3 gap-3">
                      {(trend.campaigns || []).map((c) => (
                        <div key={c.name} className="glass rounded-[22px] p-4">
                          <div className="text-[10px] uppercase tracking-wide text-[#9560E8]">{c.platform}</div>
                          <div className="font-heading text-xl mt-1">{c.brand}</div>
                          <div className="text-sm font-semibold mt-1">{c.name}</div>
                          <p className="text-xs text-slate-500 mt-2">{c.description}</p>
                          <p className="text-[11px] mt-3 text-[#3b2060]"><b>Works because</b> {c.whyItWorks}</p>
                          <div className="mt-2 text-xs font-mono text-[#9560E8]">{c.metric}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {trend.hooks && (
                    <div className="glass rounded-[22px] overflow-hidden">
                      <div className="px-5 py-3 font-heading text-lg border-b border-[#FFC0CB]/50">Ready hooks</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {trend.hooks.map((h, i) => (
                              <tr key={i} className="border-t border-[#FFF0E5]">
                                <td className="p-3 font-medium max-w-sm">{h.hook}</td>
                                <td className="p-3 whitespace-nowrap text-[#9560E8]">{h.format}</td>
                                <td className="p-3 whitespace-nowrap">{h.postingTime}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Workspace>
          )}

          {tab === "price" && (
            <Workspace
              agent="Leo"
              img="/icon-leo.jpg"
              title="Price the set like a category captain"
              meta={price?.generatedAt}
              source={price?.source}
              onRun={() => run("price")}
              onStop={stop}
              busy={busy === "price"}
              hasData={!!price}
            >
              {!price || !sku || !stats ? (
                <Empty onRun={() => run("price")} />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {SKUS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSkuId(s)}
                        className={`px-4 py-2 rounded-full text-xs font-bold capitalize ${
                          skuId === s ? "bg-[#9560E8] text-white" : "bg-white border border-[#FFC0CB]"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-slate-500">{sku.title}</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      ["Street G2G", `RM${stats.g2g.toFixed(2)}`],
                      ["Market avg", `RM${stats.avg.toFixed(2)}`],
                      ["Spread", `RM${stats.min.toFixed(2)}–${stats.max.toFixed(2)}`],
                      ["vs average", `${stats.below.toFixed(1)}%`],
                    ].map(([l, v]) => (
                      <div key={l} className="glass rounded-2xl p-4">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">{l}</div>
                        <div className="font-heading text-2xl mt-1">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-3 glass rounded-[22px] p-5 h-80">
                      <h3 className="font-heading mb-2">Category tape</h3>
                      {barData && (
                        <Bar
                          data={barData}
                          options={{
                            indexAxis: "y",
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { x: { beginAtZero: true, grid: { color: "#f5e6dc" } }, y: { grid: { display: false } } },
                          }}
                        />
                      )}
                    </div>
                    <div className="lg:col-span-2 glass rounded-[22px] p-5">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-heading">Margin lab</h3>
                        <button
                          className="text-[11px] font-bold bg-[#B0C965] px-3 py-1.5 rounded-full"
                          onClick={() => setCalc((c) => ({ ...c, testPrice: +calcOut.suggested.toFixed(2) }))}
                        >
                          Apply suggested
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {["cogs", "fee", "ads", "margin", "testPrice"].map((k) => (
                          <label key={k} className="text-[10px] font-bold uppercase text-slate-400">
                            {k}
                            <input
                              type="number"
                              className="w-full mt-1 border border-[#FFC0CB] rounded-xl px-2 py-2 font-mono text-sm bg-white"
                              value={calc[k]}
                              onChange={(e) => setCalc((p) => ({ ...p, [k]: e.target.value }))}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-[#FFF0E5] p-3">
                          Fees+ads
                          <div className="font-mono font-bold">RM{(calcOut.fee + calcOut.ads).toFixed(2)}</div>
                        </div>
                        <div className="rounded-xl bg-[#FFC0CB]/40 p-3">
                          Net
                          <div className="font-mono font-bold text-[#9560E8]">
                            RM{calcOut.net.toFixed(2)} · {calcOut.netPct.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] mt-3 text-slate-500">
                        Suggested sell RM{calcOut.suggested.toFixed(2)} to hold target margin.
                      </p>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-3 glass rounded-[22px] max-h-80 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#FFF0E5]">
                          <tr className="text-left">
                            <th className="p-3">Brand</th>
                            <th>Product</th>
                            <th className="text-right pr-3">RM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sku.competitors.map((c, i) => (
                            <tr key={i} className={isG2G(c) ? "bg-[#F3E8FF] font-semibold" : "border-t border-[#FFF0E5]"}>
                              <td className="p-3">{c.brand}</td>
                              <td>{c.name}</td>
                              <td className="text-right font-mono pr-3">{Number(c.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="lg:col-span-2 glass rounded-[22px] p-4 h-80">
                      <h3 className="font-heading text-sm mb-2">Price × quality</h3>
                      {scatterData && (
                        <Scatter
                          data={scatterData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { y: { min: 1, max: 10, grid: { color: "#f5e6dc" } }, x: { grid: { color: "#f5e6dc" } } },
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Workspace>
          )}

          {tab === "voc" && (
            <Workspace agent="Mira" img="/icon-mira.jpg" title="What shoppers actually say" meta={voc?.generatedAt} source={voc?.source} onRun={() => run("voc")} onStop={stop} busy={busy === "voc"} hasData={!!voc}>
              {!voc ? (
                <Empty onRun={() => run("voc")} />
              ) : (
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat l="Implied NPS" v={voc.nps} />
                    <Stat l="Positive share" v={`${voc.positivePct}%`} />
                    <Stat l="Themes tracked" v={(voc.themes || []).length} />
                    <Stat l="Open complaints" v={(voc.complaints || []).length} />
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(voc.themes || []).map((t) => (
                      <div key={t.theme} className="glass rounded-[22px] p-5">
                        <div className="flex justify-between text-[11px]">
                          <span className="uppercase tracking-wide text-[#9560E8]">{t.sentiment}</span>
                          <span className="text-slate-400">{t.mentions} mentions</span>
                        </div>
                        <h4 className="font-heading text-xl mt-1">{t.theme}</h4>
                        <p className="text-sm italic text-slate-600 mt-2">“{t.quote}”</p>
                        <p className="text-xs mt-3 text-[#3b2060]"><b>Move · </b>{t.action}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="font-heading">Fixes</h3>
                      {(voc.complaints || []).map((c) => (
                        <div key={c.issue} className="glass rounded-2xl p-4 text-sm">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            c.severity === "high" ? "bg-red-100 text-red-700" : "bg-[#FFF0E5] text-slate-600"
                          }`}>{c.severity}</span>
                          <div className="mt-2 font-semibold">{c.issue}</div>
                          <div className="text-xs text-slate-500 mt-1">{c.fix}</div>
                        </div>
                      ))}
                    </div>
                    <div className="glass rounded-[22px] p-5">
                      <h3 className="font-heading mb-3">SKU heat</h3>
                      {(voc.skuHeat || []).map((s) => (
                        <div key={s.sku} className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="capitalize font-semibold">{s.sku}</span>
                            <span>{s.score}/10</span>
                          </div>
                          <div className="bar"><i style={{ width: `${s.score * 10}%` }} /></div>
                          <p className="text-[11px] text-slate-500 mt-1">{s.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Workspace>
          )}

          {tab === "health" && (
            <Workspace agent="Kai" img="/icon-kai.jpg" title="Which SKUs deserve budget" meta={health?.generatedAt} source={health?.source} onRun={() => run("health")} onStop={stop} busy={busy === "health"} hasData={!!health}>
              {!health ? (
                <Empty onRun={() => run("health")} />
              ) : (
                <div className="space-y-5">
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(health.scores || []).map((s) => (
                      <div key={s.sku} className="glass rounded-[22px] p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs uppercase text-[#9560E8]">{s.sku}</div>
                            <div className="font-heading text-xl leading-snug">{s.name}</div>
                          </div>
                          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[#F3E8FF] text-[#7A45D4]">
                            {s.verdict}
                          </span>
                        </div>
                        <div className="mt-4 space-y-2 text-[11px]">
                          {[
                            ["Demand", s.demand],
                            ["Margin", s.margin],
                            ["Rivalry", s.competition],
                            ["Content", s.contentFit],
                          ].map(([l, n]) => (
                            <div key={l}>
                              <div className="flex justify-between"><span>{l}</span><span>{n}</span></div>
                              <div className="bar"><i style={{ width: `${n * 10}%` }} /></div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 font-heading text-2xl text-[#9560E8]">{s.overall}</div>
                        <ul className="mt-2 text-xs text-slate-600 list-disc pl-4">
                          {(s.moves || []).map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="glass rounded-[22px] p-5">
                    <h3 className="font-heading mb-2">This week’s priorities</h3>
                    <ol className="space-y-2 text-sm">
                      {(health.priorities || []).map((p, i) => (
                        <li key={p} className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#9560E8] text-white text-xs flex items-center justify-center">{i + 1}</span>
                          {p}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </Workspace>
          )}

          {tab === "bundle" && (
            <Workspace agent="Nia" img="/icon-nia.jpg" title="Build carts that clear free shipping" meta={bundle?.generatedAt} source={bundle?.source} onRun={() => run("bundle")} busy={busy === "bundle"}>
              {!bundle ? (
                <Empty onRun={() => run("bundle")} />
              ) : (
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Stat l="Target AOV" v={`RM${bundle.targetAov}`} />
                    <Stat l="Live bundles" v={(bundle.bundles || []).length} />
                    <Stat l="Unlock rungs" v={(bundle.thresholds || []).length} />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {(bundle.bundles || []).map((b, i) => (
                      <article key={b.name} className="glass rounded-[24px] p-6 relative overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#FFC0CB]/50" />
                        <div className="text-[11px] font-bold text-[#9560E8]">SET 0{i + 1}</div>
                        <h4 className="font-heading text-2xl mt-1">{b.name}</h4>
                        <div className="font-mono text-xl text-[#9560E8] mt-2">
                          RM{b.price} <span className="text-xs text-slate-400">save RM{b.saveVsSolo}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {(b.skus || []).map((s) => (
                            <span key={s} className="text-[11px] px-2 py-1 rounded-full bg-[#FFF0E5] border border-[#FFC0CB]">
                              {s}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm mt-3">{b.hook}</p>
                        <p className="text-xs text-slate-500 mt-1">{b.who} · {b.marginNote}</p>
                      </article>
                    ))}
                  </div>
                  {bundle.thresholds && (
                    <div className="glass rounded-[22px] p-5 flex flex-wrap gap-4">
                      {bundle.thresholds.map((t) => (
                        <div key={t.cart} className="text-sm">
                          <div className="font-mono font-bold text-[#9560E8]">RM{t.cart}+</div>
                          <div className="text-xs text-slate-500">{t.unlock}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Workspace>
          )}

          {tab === "content" && (
            <Workspace agent="Reza" img="/icon-reza.jpg" title="The week on camera" meta={content?.generatedAt} source={content?.source} onRun={() => run("content")} onStop={stop} busy={busy === "content"} hasData={!!content}>
              {!content ? (
                <Empty onRun={() => run("content")} />
              ) : (
                <div className="space-y-5">
                  <div className="glass rounded-[22px] p-5">
                    <div className="text-xs uppercase tracking-wide text-[#9560E8]">North star · week of {content.weekOf}</div>
                    <p className="font-heading text-2xl mt-1">{content.northStar}</p>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-7 gap-3">
                    {(content.days || []).map((d) => (
                      <div key={d.day} className="glass rounded-[22px] p-4 min-h-[180px]">
                        <div className="text-[11px] font-bold text-[#9560E8]">{d.day}</div>
                        <div className="font-heading text-lg mt-1">{d.format}</div>
                        <p className="text-xs mt-2 text-slate-600">{d.hook}</p>
                        <div className="mt-3 text-[11px] text-slate-400">{d.sku} · {d.time}</div>
                        <div className="text-[11px] font-semibold mt-1">KPI {d.kpi}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Workspace>
          )}
        </main>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 bg-[#3b2060]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-[24px] p-6 max-w-md w-full">
            <h3 className="font-heading text-2xl mb-1">Desk settings</h3>
            <p className="text-xs text-slate-500 mb-4">Optional LLM keys. Empty = Malaysia synthesis engines still run.</p>
            {["openai", "gemini", "search"].map((k) => (
              <label key={k} className="block text-[11px] font-bold uppercase text-slate-400 mb-3">
                {k}
                <input
                  type="password"
                  className="w-full mt-1 border border-[#FFC0CB] rounded-xl px-3 py-2 text-sm"
                  value={keys[k]}
                  onChange={(e) => setKeys((p) => ({ ...p, [k]: e.target.value }))}
                />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setSettingsOpen(false)} className="px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                className="bg-[#9560E8] text-white px-4 py-2 rounded-xl text-sm font-semibold"
                onClick={() => {
                  localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
                  setSettingsOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Workspace({ agent, img, title, meta, source, onRun, onStop, busy, hasData, children }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex gap-4 items-start">
          {img && <img src={img} alt="" className="w-16 h-16 rounded-2xl object-cover shadow-md hidden sm:block" />}
          <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9560E8] font-semibold">{agent} workspace</div>
          <h2 className="font-heading text-3xl md:text-4xl mt-1">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {source || "idle"} · last pull {fmtTime(meta)}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {busy ? (
            <button
              onClick={onStop}
              className="px-5 py-3 rounded-2xl bg-white border border-red-300 text-red-700 text-sm font-semibold"
            >
              Stop agent
            </button>
          ) : (
            <>
              <button
                onClick={onRun}
                className="px-5 py-3 rounded-2xl bg-[#9560E8] text-white text-sm font-semibold shadow-lg shadow-purple-200"
              >
                {hasData ? "Refresh agent" : "Run this agent"}
              </button>
              {hasData && (
                <button
                  onClick={onRun}
                  className="px-4 py-3 rounded-2xl bg-white border border-[#FFC0CB] text-sm font-semibold"
                >
                  Re-run
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ onRun }) {
  return (
    <div className="glass rounded-[28px] p-14 text-center">
      <img src="/routine.jpg" alt="" className="w-28 h-28 mx-auto rounded-3xl object-cover shadow mb-4" />
      <p className="font-heading text-2xl">This workspace is empty</p>
      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
        Run the agent to pull a structured brief. Cached runs stay on this browser.
      </p>
      <button onClick={onRun} className="mt-6 px-5 py-2.5 rounded-2xl bg-[#9560E8] text-white text-sm font-semibold">
        Run agent
      </button>
    </div>
  );
}

function Stat({ l, v }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{l}</div>
      <div className="font-heading text-3xl mt-1">{v}</div>
    </div>
  );
}
