// Edge Function: export stocks as CSV
// Ported from app.py export() route

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

function formatPrice(p) {
    if (p === null || p === undefined) return "";
    if (p === Math.floor(p)) return String(Math.floor(p));
    return p.toFixed(2);
}

function dayChangePct(currentPrice, prevClosePrice) {
    if (prevClosePrice === 0) return 0.0;
    return Math.round((currentPrice - prevClosePrice) / prevClosePrice * 10000) / 100;
}

function profitLossPct(currentPrice, costPrice) {
    if (costPrice === 0) return 0.0;
    return Math.round((currentPrice - costPrice) / costPrice * 10000) / 100;
}

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data: stocks, error } = await supabase
            .from("stocks")
            .select("*, portfolio:portfolio_id(name)")
            .order("code", { ascending: true });

        if (error) throw new Error(error.message);

        const BOM = "﻿";
        const header = "分组,代码,名称,成本价,现价,昨收,今日涨跌%,数量,市值,盈亏,收益率%,止损价,止盈价,状态";
        const rows = [header];

        for (const s of stocks || []) {
            const portfolioName = s.portfolio?.name || "";
            const mv = Math.round(s.current_price * s.quantity * 100) / 100;
            const pl = Math.round((mv - s.cost_price * s.quantity) * 100) / 100;
            const dcPct = dayChangePct(s.current_price, s.prev_close_price);
            const plPct = profitLossPct(s.current_price, s.cost_price);

            rows.push([
                portfolioName,
                s.code,
                s.name,
                formatPrice(s.cost_price),
                formatPrice(s.current_price),
                formatPrice(s.prev_close_price),
                (dcPct >= 0 ? "+" : "") + dcPct.toFixed(2) + "%",
                s.quantity,
                formatPrice(mv),
                formatPrice(pl),
                (plPct >= 0 ? "+" : "") + plPct.toFixed(2) + "%",
                formatPrice(s.stop_loss_price),
                formatPrice(s.take_profit_price),
                s.status,
            ].join(","));
        }

        const csv = BOM + rows.join("\n");

        return new Response(csv, {
            headers: {
                ...CORS,
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": "attachment;filename=stocks.csv",
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
});
