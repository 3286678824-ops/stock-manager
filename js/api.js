// Data access layer — all Supabase CRUD operations and Edge Function calls.
// Returns plain objects, no DOM or framework types.

import supabase from './supabase-client.js';

const FUNCTIONS_BASE = supabase.supabaseUrl + '/functions/v1';

async function callFunction(name, body = {}) {
    const resp = await fetch(`${FUNCTIONS_BASE}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.supabaseKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
    }
    return resp;
}

// ── Portfolios ─────────────────────────────────────────

export async function getPortfolios() {
    const { data, error } = await supabase.from('portfolios').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function getPortfolioById(id) {
    const { data, error } = await supabase.from('portfolios').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

export async function createPortfolio(name, description = '') {
    const { data, error } = await supabase.from('portfolios').insert({ name, description }).select().single();
    if (error) throw error;
    return data;
}

export async function updatePortfolio(id, name, description) {
    const { error } = await supabase.from('portfolios').update({ name, description }).eq('id', id);
    if (error) throw error;
}

export async function deletePortfolio(id) {
    const { error } = await supabase.from('portfolios').delete().eq('id', id);
    if (error) throw error;
}

// ── Stocks ─────────────────────────────────────────────

export async function getStocksByPortfolio(portfolioId) {
    const { data, error } = await supabase.from('stocks').select('*')
        .eq('portfolio_id', portfolioId)
        .order('status', { ascending: true })
        .order('code', { ascending: true });
    if (error) throw error;
    return data;
}

export async function getStockById(id) {
    const { data, error } = await supabase.from('stocks').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

export async function createStock(data) {
    const { data: stock, error } = await supabase.from('stocks').insert({
        portfolio_id: data.portfolioId,
        code: data.code,
        name: data.name,
        market: data.market,
        cost_price: data.costPrice,
        current_price: data.currentPrice || 0,
        prev_close_price: data.prevClosePrice || 0,
        quantity: data.quantity,
        status: data.status || 'holding',
        stop_loss_price: data.stopLossPrice || null,
        take_profit_price: data.takeProfitPrice || null,
    }).select().single();
    if (error) throw error;
    return stock;
}

export async function updateStock(id, data) {
    const updates = {};
    if (data.portfolioId !== undefined) updates.portfolio_id = data.portfolioId;
    if (data.costPrice !== undefined) updates.cost_price = data.costPrice;
    if (data.currentPrice !== undefined) updates.current_price = data.currentPrice;
    if (data.prevClosePrice !== undefined) updates.prev_close_price = data.prevClosePrice;
    if (data.quantity !== undefined) updates.quantity = data.quantity;
    if (data.status !== undefined) updates.status = data.status;
    if (data.stopLossPrice !== undefined) updates.stop_loss_price = data.stopLossPrice;
    if (data.takeProfitPrice !== undefined) updates.take_profit_price = data.takeProfitPrice;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('stocks').update(updates).eq('id', id);
    if (error) throw error;
}

export async function deleteStock(id) {
    const { error } = await supabase.from('stocks').delete().eq('id', id);
    if (error) throw error;
}

export async function getAllStocks() {
    const { data, error } = await supabase.from('stocks').select('*');
    if (error) throw error;
    return data;
}

// ── Trade Logs ─────────────────────────────────────────

export async function getTradesByStock(stockId) {
    const { data, error } = await supabase.from('trade_logs').select('*')
        .eq('stock_id', stockId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getAllTrades(page = 1, perPage = 30) {
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const { data, error, count } = await supabase.from('trade_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
    if (error) throw error;
    return { logs: data, total: count, page, perPage };
}

export async function createTradeLog(data) {
    const { data: log, error } = await supabase.from('trade_logs').insert({
        stock_id: data.stockId,
        action: data.action,
        price: data.price,
        quantity: data.quantity,
        note: data.note || '',
    }).select().single();
    if (error) throw error;
    return log;
}

// ── Daily Snapshots ────────────────────────────────────

export async function getSnapshots(stockId, limit = 10) {
    const { data, error } = await supabase.from('daily_snapshots').select('*')
        .eq('stock_id', stockId)
        .order('date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}

// ── Edge Functions ─────────────────────────────────────

export async function fetchStockPrice(code) {
    const resp = await callFunction('fetch-stock-price', { code });
    return resp.json();
}

export async function fetchKline(code, days = 60) {
    const resp = await callFunction('fetch-kline', { code, days });
    return resp.json();
}

export async function refreshStockPrices() {
    const resp = await callFunction('refresh-prices');
    return resp.json();
}

export async function saveSnapshots() {
    const resp = await callFunction('save-snapshots');
    return resp.json();
}

export async function exportCsv() {
    const resp = await callFunction('export-csv');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stocks.csv';
    a.click();
    URL.revokeObjectURL(url);
}
