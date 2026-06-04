// Edge Function: Serve static site from Storage bucket with proper headers

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
};

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function getMime(path: string): string {
    const ext = path.substring(path.lastIndexOf("."));
    return MIME[ext] || "application/octet-stream";
}

Deno.serve(async (req) => {
    const url = new URL(req.url);
    // Extract path after function name. URL pattern: /functions/v1/site/[...path]
    let path = url.pathname.replace(/.*\/site\/?/, "");
    if (!path || path === "/") path = "index.html";

    // Only add .html for page paths (no extension, no subdirectory middle segments)
    // e.g. /stock-detail → stock-detail.html, but /js/config → leave as-is (will 404)
    const lastSeg = path.split("/").pop() || "";
    if (!lastSeg.includes(".") && !path.includes("/")) {
        path = path + ".html";
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data, error } = await supabase.storage.from("site").download(path);
        if (error || !data) {
            // Try without .html
            const altPath = path.replace(/\.html$/, "");
            const { data: data2, error: error2 } = await supabase.storage.from("site").download(altPath);
            if (error2 || !data2) {
                // Fall back to index.html for SPA-style routing
                const { data: data3 } = await supabase.storage.from("site").download("index.html");
                if (!data3) {
                    return new Response("Not Found", { status: 404, headers: CORS });
                }
                const mime = getMime("index.html");
                return new Response(data3, { headers: { ...CORS, "Content-Type": mime } });
            }
            const mime = getMime(altPath);
            return new Response(data2, { headers: { ...CORS, "Content-Type": mime } });
        }

        const mime = getMime(path);
        return new Response(data, { headers: { ...CORS, "Content-Type": mime } });
    } catch (e) {
        return new Response("Internal Error: " + (e as Error).message, { status: 500, headers: CORS });
    }
});
