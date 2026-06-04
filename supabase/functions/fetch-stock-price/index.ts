// Edge Function: fetch single or batch stock prices
// Ported from stock_data.py — 3-tier fallback: Sina → Eastmoney → Tonghuashun

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

// ── Sina ──────────────────────────────────────────────

function parseSinaLine(text) {
    const m = text.match(/"(.+)"/);
    if (!m) return null;
    const parts = m[1].split(",");
    if (parts.length < 10 || !parts[0]) return null;
    return {
        name: parts[0],
        open: parseFloat(parts[1]) || 0,
        pre_close: parseFloat(parts[2]) || 0,
        current_price: parseFloat(parts[3]) || 0,
        high: parseFloat(parts[4]) || 0,
        low: parseFloat(parts[5]) || 0,
        volume: parseInt(String(parseFloat(parts[8]) || 0)),
        turnover: parseFloat(parts[9]) || 0,
    };
}

async function fetchSina(code) {
    const prefix = marketPrefix(code);
    const url = SINA_URL + prefix;
    const resp = await fetch(url, { headers: SINA_HEADERS });
    const buffer = await resp.arrayBuffer();
    const decoder = new TextDecoder("gbk");
    const text = decoder.decode(buffer);
    const info = parseSinaLine(text);
    if (info && info.current_price > 0) {
        const preClose = info.pre_close;
        return {
            code,
            name: info.name,
            current_price: info.current_price,
            pre_close: preClose,
            open: info.open,
            high: info.high,
            low: info.low,
            volume: info.volume,
            turnover: info.turnover,
            change_pct: preClose ? Math.round((info.current_price - preClose) / preClose * 10000) / 100 : 0,
            change_amount: Math.round((info.current_price - preClose) * 100) / 100,
        };
    }
    return null;
}

// ── Eastmoney ─────────────────────────────────────────

async function fetchEastmoney(code) {
    const marketCode = (detectMarket(code) === "sh" ? "1" : "0") + "." + code;
    const url = "https://push2.eastmoney.com/api/qt/stock/get?" + new URLSearchParams({
        secid: marketCode,
        fields: "f43,f57,f58,f60,f170",
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
            code,
            name: data.f58 || code,
            current_price: price,
            pre_close: (data.f60 || 0) / 100,
            change_pct: (data.f170 || 0) / 100,
        };
    } catch {
        return null;
    }
}

// ── Tonghuashun ───────────────────────────────────────

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
        if (!items) return null;
        const priceStr = items["30"] || items["10"] || "";
        if (!priceStr) return null;
        const price = parseFloat(priceStr);
        const preClose = parseFloat(items["6"] || 0);
        return {
            code,
            name: items.name || code,
            current_price: price,
            pre_close: preClose || 0,
            change_pct: preClose ? Math.round((price - preClose) / preClose * 10000) / 100 : 0,
        };
    } catch {
        return null;
    }
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

function corsPreflight() {
    return new Response(null, { status: 204, headers: CORS });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return corsPreflight();

    try {
        const { code } = await req.json();

        if (!code) {
            return json({ error: "Missing code" }, 400);
        }

        // 3-tier fallback
        let info = await fetchSina(code);
        if (!info) info = await fetchEastmoney(code);
        if (!info) info = await fetchTonghuashun(code);

        if (!info || !info.current_price) {
            return json({ error: `无法获取 ${code} 的行情` }, 404);
        }

        return json(info);
    } catch (e) {
        return json({ error: e.message }, 500);
    }
});
