// Edge Function: fetch stock announcements/news from Eastmoney

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
        const { code } = await req.json();

        if (!code) {
            return json({ error: "Missing code" }, 400);
        }

        const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?${
            new URLSearchParams({
                sr: "-1",
                page_size: "10",
                page_index: "1",
                ann_type: "A",
                client_source: "web",
                stock_list: String(code),
                f_node: "0",
                s_node: "0",
            })
        }`;

        const resp = await fetch(url);
        const data = await resp.json();

        if (!data.success || !data.data || !Array.isArray(data.data.list)) {
            return json([]);
        }

        const result = data.data.list.map((item: Record<string, any>) => {
            const columnNames = (item.columns || []).map((c: any) => c.column_name).filter(Boolean);
            return {
                title: item.title || "",
                source: columnNames.length > 0 ? columnNames.join("、") : (item.ann_type_name || "公告"),
                date: item.notice_date ? item.notice_date.split(" ")[0] : "",
                url: `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html`,
            };
        });

        return json(result);
    } catch (e) {
        return json({ error: e.message }, 500);
    }
});
