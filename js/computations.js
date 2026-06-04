// Pure computation functions — framework-agnostic, reusable in React Native.
// Ported from models.py Stock model properties and app.py helpers.

/**
 * Detect A-share market from stock code.
 * Returns: 'sh' | 'sz' | 'bj'
 */
export function detectMarket(code) {
    code = code.trim();
    if (/^(8|4)/.test(code) || /^92/.test(code)) return 'bj';
    if (/^(6|9)/.test(code)) return 'sh';
    return 'sz';
}

/**
 * Current market value = current_price * quantity
 */
export function marketValue(currentPrice, quantity) {
    return round2(currentPrice * quantity);
}

/**
 * Total cost value = cost_price * quantity
 */
export function costValue(costPrice, quantity) {
    return round2(costPrice * quantity);
}

/**
 * Absolute profit/loss = market_value - cost_value
 */
export function profitLoss(mv, cv) {
    return round2(mv - cv);
}

/**
 * Profit/loss percentage
 */
export function profitLossPct(currentPrice, costPrice) {
    if (costPrice === 0) return 0.0;
    return round2((currentPrice - costPrice) / costPrice * 100);
}

/**
 * Day change percentage
 */
export function dayChangePct(currentPrice, prevClosePrice) {
    if (prevClosePrice === 0) return 0.0;
    return round2((currentPrice - prevClosePrice) / prevClosePrice * 100);
}

/**
 * Stop-loss / take-profit status.
 * Returns: 'normal' | 'stop_warn' | 'stop_hit' | 'profit_warn' | 'profit_hit'
 */
export function stopLossStatus(currentPrice, stopLossPrice, takeProfitPrice) {
    if (currentPrice === 0) return 'normal';
    let result = 'normal';

    if (stopLossPrice && stopLossPrice > 0) {
        if (currentPrice <= stopLossPrice) {
            result = 'stop_hit';
        } else if (currentPrice <= stopLossPrice * 1.03) {
            result = 'stop_warn';
        }
    }

    if (takeProfitPrice && takeProfitPrice > 0) {
        if (currentPrice >= takeProfitPrice) {
            result = 'profit_hit';
        } else if (result === 'normal' && currentPrice >= takeProfitPrice * 0.97) {
            result = 'profit_warn';
        }
    }

    return result;
}

/**
 * Row CSS class for stop-loss/profit status coloring
 */
export function rowClass(status) {
    const map = {
        stop_hit: 'table-danger',
        stop_warn: 'table-warning',
        profit_hit: 'table-success',
        profit_warn: 'table-info',
    };
    return map[status] || '';
}

/**
 * Status dot color for dropdown / indicators
 */
export function statusColor(status) {
    const map = {
        stop_hit: 'danger',
        stop_warn: 'warning',
        profit_hit: 'success',
        profit_warn: 'info',
        normal: 'secondary',
    };
    return map[status] || 'secondary';
}

/**
 * Generate alerts from stocks array
 */
export function alertsFromStocks(stocks) {
    const stop_hit = [];
    const stop_warn = [];
    const profit_hit = [];
    const profit_warn = [];

    for (const s of stocks) {
        const status = stopLossStatus(s.current_price, s.stop_loss_price, s.take_profit_price);
        if (status === 'stop_hit') stop_hit.push(s);
        else if (status === 'stop_warn') stop_warn.push(s);
        else if (status === 'profit_hit') profit_hit.push(s);
        else if (status === 'profit_warn') profit_warn.push(s);
    }

    return {
        stop_hit,
        stop_warn,
        profit_hit,
        profit_warn,
        has_any: stop_hit.length > 0 || stop_warn.length > 0 || profit_hit.length > 0 || profit_warn.length > 0,
    };
}

/**
 * Portfolio summary from stocks
 */
export function summaryFromStocks(stocks) {
    let totalMv = 0;
    let totalCost = 0;
    let totalDayChange = 0;

    for (const s of stocks) {
        const mv = marketValue(s.current_price, s.quantity);
        const cost = costValue(s.cost_price, s.quantity);
        totalMv += mv;
        totalCost += cost;
        const dcPct = dayChangePct(s.current_price, s.prev_close_price);
        totalDayChange += mv * dcPct / 100;
    }

    const totalPl = round2(totalMv - totalCost);
    const totalPlPct = totalCost !== 0 ? round2(totalPl / totalCost * 100) : 0.0;

    return {
        count: stocks.length,
        total_mv: round2(totalMv),
        total_cost: round2(totalCost),
        total_pl: totalPl,
        total_pl_pct: totalPlPct,
        total_day_change: round2(totalDayChange),
    };
}

function round2(n) {
    return Math.round(n * 100) / 100;
}
