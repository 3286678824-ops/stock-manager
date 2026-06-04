// Edge Function: save daily snapshots for all stocks
// Ported from app.py save_snapshots() and _save_snapshot()

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

function todayDateStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data: stocks, error } = await supabase.from("stocks").select("*").gt("current_price", 0);
        if (error) throw new Error(error.message);
        if (!stocks || stocks.length === 0) {
            return json({ ok: true, saved: 0 });
        }

        const today = todayDateStr();
        let count = 0;

        for (const stock of stocks) {
            const mv = Math.round(stock.current_price * stock.quantity * 100) / 100;
            const plPct = stock.cost_price > 0
                ? Math.round((stock.current_price - stock.cost_price) / stock.cost_price * 10000) / 100
                : 0;

            const { error: upsertError } = await supabase.from("daily_snapshots").upsert({
                stock_id: stock.id,
                date: today,
                close_price: stock.current_price,
                cost_price_snapshot: stock.cost_price,
                quantity_snapshot: stock.quantity,
                market_value_snapshot: mv,
                profit_loss_pct_snapshot: plPct,
            }, { onConflict: "stock_id, date" });

            if (!upsertError) count++;
        }

        return json({ ok: true, saved: count });
    } catch (e) {
        return json({ ok: false, error: e.message }, 500);
    }
});
