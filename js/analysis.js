// Technical analysis module — pure computation, framework-agnostic.
// Ported from analysis.py. Takes klines array as input, no network calls.
//
// Usage:
//   import { analyze } from './analysis.js';
//   const result = analyze('600519', 1850.00, 1800.00, klines);

// ── helpers ───────────────────────────────────────────

function round2(n) {
    return Math.round(n * 100) / 100;
}

function roundToTick(price) {
    if (price < 10) return round2(price);
    if (price < 100) return Math.round(price * 10) / 10;
    return Math.round(price);
}

// ── ATR ───────────────────────────────────────────────

export function calcAtr(klines, period = 14) {
    if (klines.length < 2) return 0.0;

    const trValues = [];
    for (let i = 1; i < klines.length; i++) {
        const high = klines[i].high;
        const low = klines[i].low;
        const prevClose = klines[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trValues.push(tr);
        if (trValues.length >= period) break;
    }

    if (trValues.length === 0) return 0.0;
    return round2(trValues.reduce((a, b) => a + b, 0) / trValues.length);
}

// ── Swing Points ──────────────────────────────────────

export function findSwingPoints(klines, window = 5) {
    const n = klines.length;
    if (n < window * 2 + 1) return [[], []];

    const highs = [];
    const lows = [];

    for (let i = window; i < n - window; i++) {
        const bar = klines[i];
        const left = klines.slice(i - window, i);
        const right = klines.slice(i + 1, i + 1 + window);

        if (left.every(b => bar.high >= b.high) && right.every(b => bar.high >= b.high)) {
            highs.push({ date: bar.date, price: bar.high, type: 'swing_high' });
        }
        if (left.every(b => bar.low <= b.low) && right.every(b => bar.low <= b.low)) {
            lows.push({ date: bar.date, price: bar.low, type: 'swing_low' });
        }
    }

    highs.sort((a, b) => b.price - a.price);
    lows.sort((a, b) => a.price - b.price);
    return [highs, lows];
}

// ── Support / Resistance ──────────────────────────────

export function findSupportResistance(klines, n = 3) {
    const allLevels = [];
    const recent = klines.slice(-40);
    for (const k of recent) {
        allLevels.push(k.low);
        allLevels.push(k.high);
    }

    allLevels.sort((a, b) => a - b);

    const clusters = [];
    for (const price of allLevels) {
        let merged = false;
        for (const cluster of clusters) {
            const avg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
            if (Math.abs(price - avg) / avg < 0.015) {
                cluster.push(price);
                merged = true;
                break;
            }
        }
        if (!merged) clusters.push([price]);
    }

    const supports = [];
    const resistances = [];
    const lastClose = klines[klines.length - 1].close;

    for (const cluster of clusters) {
        if (cluster.length < n) continue;
        const avgPrice = roundToTick(cluster.reduce((a, b) => a + b, 0) / cluster.length);
        const entry = {
            price: avgPrice,
            touches: cluster.length,
            zone: roundToTick(Math.min(...cluster)) + '-' + roundToTick(Math.max(...cluster)),
        };
        if (avgPrice < lastClose) {
            supports.push(entry);
        } else {
            resistances.push(entry);
        }
    }

    supports.sort((a, b) => b.price - a.price);
    resistances.sort((a, b) => a.price - b.price);
    return [supports, resistances];
}

// ── Consolidation Detection ───────────────────────────

export function findConsolidation(klines, lookback = 20) {
    if (klines.length < lookback) return null;

    const recent = klines.slice(-lookback);
    const highs = recent.map(k => k.high);
    const lows = recent.map(k => k.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const rangePct = (maxH - minL) / minL * 100;
    const atr = calcAtr(klines, 14);

    if (atr > 0 && (maxH - minL) < atr * 1.5 && rangePct < 8) {
        return {
            upper: roundToTick(maxH),
            lower: roundToTick(minL),
            range_pct: round2(rangePct),
            atr: roundToTick(atr),
        };
    }
    return null;
}

// ── Moving Average ────────────────────────────────────

export function calcMa(klines, period) {
    if (klines.length < period) return 0.0;
    const closes = klines.slice(-period).map(k => k.close);
    return round2(closes.reduce((a, b) => a + b, 0) / period);
}

// ── Stop-Loss Suggestion ──────────────────────────────

export function suggestStopLoss(klines, currentPrice) {
    const atr = calcAtr(klines, 14);
    const atrStop = currentPrice - atr * 2;

    const [, swingLows] = findSwingPoints(klines);
    const [supports] = findSupportResistance(klines);
    const consolidation = findConsolidation(klines);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);

    const candidates = [];

    if (atr > 0) {
        candidates.push({ method: 'ATR(14)×2', price: atrStop, reason: `现价减去2倍ATR(${roundToTick(atr)})` });
    }

    for (const sl of swingLows.slice(0, 3)) {
        candidates.push({ method: `前低 ${sl.date}`, price: sl.price, reason: `近期重要低点 (${sl.date})` });
    }

    if (ma20 > 0 && ma20 < currentPrice) {
        candidates.push({ method: 'MA20均线', price: ma20, reason: '20日均线支撑' });
    }
    if (ma60 > 0 && ma60 < currentPrice) {
        candidates.push({ method: 'MA60均线', price: ma60, reason: '60日均线支撑' });
    }

    for (const s of supports.slice(0, 2)) {
        candidates.push({ method: '支撑位', price: s.price, reason: `价格区间${s.zone}，触及${s.touches}次` });
    }

    if (consolidation) {
        candidates.push({
            method: '平台下沿',
            price: consolidation.lower,
            reason: `近期整理平台下沿(${consolidation.range_pct}%震荡)`,
        });
    }

    // Filter valid, pick highest safe level
    const valid = candidates.filter(c => c.price > 0 && c.price < currentPrice);
    valid.sort((a, b) => b.price - a.price);

    const used = [];
    const seen = new Set();
    for (const c of valid) {
        const p = roundToTick(c.price);
        if (!seen.has(p)) {
            used.push({ method: c.method, price: p, reason: c.reason });
            seen.add(p);
        }
    }

    const suggestion = used.length > 0 ? used[0].price
        : atrStop > 0 ? roundToTick(atrStop)
        : roundToTick(currentPrice * 0.95);

    return {
        suggested: roundToTick(suggestion),
        atr: roundToTick(atr),
        atr_stop: atrStop > 0 ? roundToTick(atrStop) : null,
        details: used,
    };
}

// ── Take-Profit Suggestion ────────────────────────────

export function suggestTakeProfit(klines, currentPrice, costPrice) {
    const [swingHighs] = findSwingPoints(klines);
    const [, resistances] = findSupportResistance(klines);
    const consolidation = findConsolidation(klines);

    const candidates = [];

    for (const sh of swingHighs.slice(0, 3)) {
        if (sh.price > currentPrice) {
            candidates.push({ method: `前高 ${sh.date}`, price: sh.price, reason: `近期重要高点 (${sh.date})` });
        }
    }

    for (const r of resistances.slice(0, 2)) {
        if (r.price > currentPrice) {
            candidates.push({ method: '压力位', price: r.price, reason: `价格区间${r.zone}，触及${r.touches}次` });
        }
    }

    if (consolidation && consolidation.upper > currentPrice) {
        candidates.push({ method: '平台上沿', price: consolidation.upper, reason: '近期整理平台上沿' });
    }

    // Risk/reward target (min 1:1.5)
    if (costPrice > 0) {
        const risk = currentPrice < costPrice ? costPrice - currentPrice : currentPrice * 0.05;
        const rrTarget = currentPrice + Math.abs(risk) * 1.5;
        candidates.push({ method: '盈亏比1:1.5', price: rrTarget, reason: `基于风险${roundToTick(Math.abs(risk))}的目标价` });
    }

    const valid = candidates.filter(c => c.price > currentPrice);
    valid.sort((a, b) => a.price - b.price);

    const used = [];
    const seen = new Set();
    for (const c of valid) {
        const p = roundToTick(c.price);
        if (!seen.has(p)) {
            used.push({ method: c.method, price: p, reason: c.reason });
            seen.add(p);
        }
    }

    const suggestion = used.length > 0 ? used[0].price : roundToTick(currentPrice * 1.1);
    return {
        suggested: roundToTick(suggestion),
        details: used,
    };
}

// ── Full Analysis ─────────────────────────────────────

/**
 * Run full technical analysis.
 * @param {string} code - Stock code
 * @param {number} currentPrice - Latest price
 * @param {number} costPrice - User's cost basis
 * @param {Array} klines - K-line data [{date, open, close, high, low, volume}]
 * @returns {Object} Analysis results
 */
export function analyze(code, currentPrice, costPrice, klines) {
    if (klines.length < 14) {
        return { error: `数据不足（仅获取到${klines.length}个交易日），至少需要14个交易日` };
    }

    const days = Math.min(klines.length, 60);
    const atr = calcAtr(klines);
    const [swingHighs, swingLows] = findSwingPoints(klines);
    const [supports, resistances] = findSupportResistance(klines);
    const consolidation = findConsolidation(klines);
    const ma5 = calcMa(klines, 5);
    const ma10 = calcMa(klines, 10);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);

    const stopLoss = suggestStopLoss(klines, currentPrice);
    const takeProfit = suggestTakeProfit(klines, currentPrice, costPrice);

    // Price position analysis
    const recentKlines = klines.slice(-days);
    const recentHigh = Math.max(...recentKlines.map(k => k.high));
    const recentLow = Math.min(...recentKlines.map(k => k.low));
    const positionInRange = recentHigh !== recentLow
        ? round2((currentPrice - recentLow) / (recentHigh - recentLow) * 100)
        : 50;

    // Trend detection
    let trend, trendClass;
    if (ma5 > ma10 && ma10 > ma20) {
        trend = '上升趋势（短期均线多头排列）';
        trendClass = 'success';
    } else if (ma5 < ma10 && ma10 < ma20) {
        trend = '下降趋势（短期均线空头排列）';
        trendClass = 'danger';
    } else {
        trend = '震荡整理（均线交织）';
        trendClass = 'warning';
    }

    return {
        code,
        current_price: currentPrice,
        cost_price: costPrice,
        atr: roundToTick(atr),
        atr_pct: currentPrice ? round2(atr / currentPrice * 100) : 0,
        swing_highs: swingHighs.slice(0, 5),
        swing_lows: swingLows.slice(0, 5),
        supports: supports.slice(0, 5),
        resistances: resistances.slice(0, 5),
        consolidation,
        ma5: roundToTick(ma5),
        ma10: roundToTick(ma10),
        ma20: roundToTick(ma20),
        ma60: roundToTick(ma60),
        stop_loss: stopLoss,
        take_profit: takeProfit,
        trend,
        trend_class: trendClass,
        recent_high: roundToTick(recentHigh),
        recent_low: roundToTick(recentLow),
        position_in_range: positionInRange,
        data_days: klines.length,
    };
}
