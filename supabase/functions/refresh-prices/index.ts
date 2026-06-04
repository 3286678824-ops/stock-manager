// Edge Function: batch refresh all stock prices, update database
// Ported from stock_data.py refresh_all_prices() + app.py refresh() route

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const SINA_URL = "https://hq.sinajs.cn/list=";
const SINA_HEADERS = { "Referer": "https://finance.sina.com.cn" };

// ── helpers ───────────────────────────────────────────

function detectMarket(code) {
    if (/^(8|4)/.test(code)) return "bj";
    if (/^92/.test(code)) return "bj";
    if (/^(6|9)/.test(code)) return "sh";
    return "sz";
}

function marketPrefix(code) {
    return detectMarket(code) + code;
}

function parseSinaLine(text) {
    const m = text.match(/"(.+)"/);
    if (!m) return null;
    const parts = m[1].split(",");
    if (parts.length < 10 || !parts[0]) return null;
    return {
        name: parts[0],
        current_price: parseFloat(parts[3]) || 0,
        pre_close: parseFloat(parts[2]) || 0,
    };
}

// ── Eastmoney fallback ────────────────────────────────

async function fetchEastmoney(code) {
    const marketCode = (detectMarket(code) === "sh" ? "1" : "0") + "." + code;
    const url = "https://push2.eastmoney.com/api/qt/stock/get?" + new URLSearchParams({
        secid: marketCode,
        fields: "f43,f57,f58,f60",
    });
    try {
        const resp = await fetch(url);
        const json = await resp.json();
        const data = json.data;
        if (!data) return null;
        let price = data.f43 || 0;
        if (!price) return null;
        price = price > 100 ? price / 100 : price;
        return {
            name: data.f58 || code,
            current_price: price,
            pre_close: (data.f60 || 0) / 100,
        };
    } catch {
        return null;
    }
}

// ── Tonghuashun fallback ──────────────────────────────

async function fetchTonghuashun(code) {
    const url = `https://d.10jqka.com.cn/v2/realhead/hs_${code}/last.js`;
    try {
        const resp = await fetch(url);
        const text = await resp.text();
        const start = text.indexOf("(");
        const end = text.lastIndexOf(")");
        if (start === -1 || end === -1) return null;
        const data = JSON.parse(text.slice(start + 1, end));
        const items = data.items || {};
        const priceStr = items["30"] || items["10"] || "";
        if (!priceStr) return null;
        return {
            name: items.name || code,
            current_price: parseFloat(priceStr),
            pre_close: parseFloat(items["6"] || 0) || 0,
        };
    } catch {
        return null;
    }
}

// ── Daily snapshots ───────────────────────────────────

function todayDateStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ── Main handler ──────────────────────────────────────

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
        const authHeader = req.headers.get("Authorization") || "";
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // Get all stocks
        const { data: stocks, error } = await supabase.from("stocks").select("*");
        if (error) throw new Error("Failed to fetch stocks: " + error.message);
        if (!stocks || stocks.length === 0) {
            return json({ ok: true, updated: 0 });
        }

        // Batch fetch from Sina
        const codes = stocks.map(s => marketPrefix(s.code)).join(",");
        const updatedIds = new Set();

        try {
            const resp = await fetch(SINA_URL + codes, { headers: SINA_HEADERS });
            const buffer = await resp.arrayBuffer();
            const decoder = new TextDecoder("gbk");
            const text = decoder.decode(buffer);
            const lines = text.trim().split("\n");

            for (let i = 0; i < stocks.length && i < lines.length; i++) {
                const info = parseSinaLine(lines[i]);
                if (info && info.current_price > 0) {
                    await supabase.from("stocks").update({
                        name: info.name,
                        current_price: info.current_price,
                        prev_close_price: info.pre_close,
                        updated_at: new Date().toISOString(),
                    }).eq("id", stocks[i].id);
                    updatedIds.add(stocks[i].id);
                }
            }
        } catch (e) {
            console.error("Sina batch failed:", e);
        }

        // Fallback for stocks not updated by Sina
        for (const stock of stocks) {
            if (updatedIds.has(stock.id)) continue;

            let info = await fetchEastmoney(stock.code);
            if (!info) info = await fetchTonghuashun(stock.code);

            if (info && info.current_price > 0) {
                await supabase.from("stocks").update({
                    name: info.name,
                    current_price: info.current_price,
                    prev_close_price: info.pre_close || stock.prev_close_price,
                    updated_at: new Date().toISOString(),
                }).eq("id", stock.id);
                updatedIds.add(stock.id);
            }
        }

        // Save daily snapshots for updated stocks
        const today = todayDateStr();
        for (const stock of stocks) {
            if (!updatedIds.has(stock.id) || stock.current_price <= 0) continue;
            // Upsert snapshot
            const mv = Math.round(stock.current_price * stock.quantity * 100) / 100;
            const cv = Math.round(stock.cost_price * stock.quantity * 100) / 100;
            const plPct = stock.cost_price > 0
                ? Math.round((stock.current_price - stock.cost_price) / stock.cost_price * 10000) / 100
                : 0;

            await supabase.from("daily_snapshots").upsert({
                stock_id: stock.id,
                date: today,
                close_price: stock.current_price,
                cost_price_snapshot: stock.cost_price,
                quantity_snapshot: stock.quantity,
                market_value_snapshot: mv,
                profit_loss_pct_snapshot: plPct,
            }, { onConflict: "stock_id, date" });
        }

        return json({ ok: true, updated: updatedIds.size });
    } catch (e) {
        return json({ ok: false, error: e.message }, 500);
    }
});
