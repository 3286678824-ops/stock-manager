// Edge Function: fetch K-line history data
// Ported from stock_data.py get_history_kline()

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function detectMarket(code) {
    if (/^(8|4)/.test(code)) return "bj";
    if (/^92/.test(code)) return "bj";
    if (/^(6|9)/.test(code)) return "sh";
    return "sz";
}

function marketPrefix(code) {
    return detectMarket(code) + code;
}

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
        const { code, days = 60 } = await req.json();

        if (!code) {
            return json({ error: "Missing code" }, 400);
        }

        const prefix = marketPrefix(code);
        const url = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?" +
            new URLSearchParams({ symbol: prefix, scale: "240", ma: "no", datalen: String(days) });

        const resp = await fetch(url, {
            headers: { "Referer": "https://finance.sina.com.cn" },
        });
        const data = await resp.json();

        if (!Array.isArray(data)) {
            return json([]);
        }

        const result = data.map(bar => ({
            date: bar.day || "",
            open: parseFloat(bar.open) || 0,
            close: parseFloat(bar.close) || 0,
            high: parseFloat(bar.high) || 0,
            low: parseFloat(bar.low) || 0,
            volume: parseInt(String(parseFloat(bar.volume) || 0)),
        }));

        return json(result);
    } catch (e) {
        return json({ error: e.message }, 500);
    }
});
