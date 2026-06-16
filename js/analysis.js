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

// ── Stop-Loss Suggestion (Multi-Layer) ─────────────────

export function suggestStopLoss(klines, currentPrice, costPrice = 0) {
    const atr = calcAtr(klines, 14);
    const atrStop = currentPrice - atr * 2;

    const [, swingLows] = findSwingPoints(klines);
    const [supports] = findSupportResistance(klines);
    const consolidation = findConsolidation(klines);
    const ma5 = calcMa(klines, 5);
    const ma10 = calcMa(klines, 10);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);

    const layers = [];
    const trendWarnings = [];

    // ── Layer 1: Fixed Percentage Stop (from cost price) ──
    if (costPrice > 0) {
        const stop5 = roundToTick(costPrice * 0.95);
        const stop8 = roundToTick(costPrice * 0.92);
        if (stop5 < currentPrice) {
            layers.push({ level: '保守止损', method: '固定比例-5%', price: stop5,
                reason: `成本价${roundToTick(costPrice)}下跌5%，先保命` });
        }
        if (stop8 < currentPrice && stop8 < stop5) {
            layers.push({ level: '强制止损', method: '固定比例-8%', price: stop8,
                reason: `成本价${roundToTick(costPrice)}下跌8%，无条件离场` });
        }
    } else {
        const stop5 = roundToTick(currentPrice * 0.95);
        layers.push({ level: '保守止损', method: '固定比例-5%', price: stop5,
            reason: '现价下跌5%止损' });
    }

    // ── Layer 2: Support Break Stop ──
    if (supports.length > 0) {
        const nearestSupport = supports[0];
        const breakPrice = roundToTick(nearestSupport.price * 0.98);
        if (breakPrice < currentPrice) {
            layers.push({ level: '支撑止损', method: '跌破支撑位', price: breakPrice,
                reason: `跌破最近支撑${roundToTick(nearestSupport.price)}(触及${nearestSupport.touches}次)的98%` });
        }
    }

    // ── Layer 3: Trend Stop ──
    if (ma20 > 0 && ma20 < currentPrice) {
        const isDeathCross = ma5 < ma10 && ma10 < ma20;
        const isLongTermBear = ma20 < ma60;
        if (isDeathCross && isLongTermBear) {
            layers.push({ level: '趋势止损', method: '空头排列止损', price: roundToTick(ma20),
                reason: 'MA5<MA10<MA20<MA60，严重空头排列，跌破MA20离场' });
            trendWarnings.push('严重空头排列(MA5<MA10<MA20<MA60)，不建议加仓');
        } else if (isDeathCross) {
            layers.push({ level: '趋势止损', method: '短期空头止损', price: roundToTick(ma20),
                reason: '短期均线空头排列(MA5<MA10<MA20)，跌破MA20止损' });
            trendWarnings.push('短期均线空头排列，趋势走弱');
        } else if (currentPrice < ma20) {
            layers.push({ level: '趋势止损', method: '跌破MA20', price: roundToTick(ma20),
                reason: '股价已跌破20日均线，反弹至MA20附近考虑减仓' });
            trendWarnings.push('股价低于MA20，中期趋势偏弱');
        }
    }

    // Platform support
    if (consolidation && consolidation.lower < currentPrice) {
        const platformStop = roundToTick(consolidation.lower * 0.99);
        layers.push({ level: '形态止损', method: '平台下沿', price: platformStop,
            reason: `整理平台下沿${roundToTick(consolidation.lower)}(${consolidation.range_pct}%震荡)` });
    }

    // ── Layer 4: ATR as Extreme Backup ──
    if (atrStop > 0) {
        layers.push({ level: '极限风控', method: 'ATR(14)×2', price: roundToTick(atrStop),
            reason: `现价减2倍ATR(${roundToTick(atr)})，最后逃生门，不到万不得已不使用` });
    }

    // ── Pick recommended: tightest non-ATR stop = max(fixed%, support, trend) ──
    const nonAtr = layers.filter(l => l.method !== 'ATR(14)×2' && l.price > 0 && l.price < currentPrice);
    nonAtr.sort((a, b) => b.price - a.price);

    const recommended = nonAtr.length > 0 ? nonAtr[0].price
        : atrStop > 0 ? roundToTick(atrStop)
        : roundToTick(currentPrice * 0.95);

    return {
        suggested: recommended,
        atr: roundToTick(atr),
        atr_stop: atrStop > 0 ? roundToTick(atrStop) : null,
        layers,
        trend_warnings: trendWarnings,
    };
}

// ── Take-Profit Suggestion (Multi-Tier) ──────────────────

export function suggestTakeProfit(klines, currentPrice, costPrice) {
    const [swingHighs] = findSwingPoints(klines);
    const [, resistances] = findSupportResistance(klines);
    const consolidation = findConsolidation(klines);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);

    const candidates = [];

    // Collect resistance levels above current price
    for (const r of resistances) {
        if (r.price > currentPrice) {
            candidates.push({ source: '压力位', price: r.price, reason: `价格区间${r.zone}，触及${r.touches}次` });
        }
    }

    for (const sh of swingHighs) {
        if (sh.price > currentPrice) {
            candidates.push({ source: `前高 ${sh.date}`, price: sh.price, reason: `近期重要高点 (${sh.date})` });
        }
    }

    if (consolidation && consolidation.upper > currentPrice) {
        candidates.push({ source: '平台上沿', price: consolidation.upper, reason: `整理平台上沿(${consolidation.range_pct}%震荡)` });
    }

    // MA targets (if price is below them)
    if (ma20 > currentPrice) {
        candidates.push({ source: 'MA20回归', price: ma20, reason: '20日均线回归目标' });
    }

    // Sort ascending, deduplicate
    candidates.sort((a, b) => a.price - b.price);
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
        const p = roundToTick(c.price);
        if (!seen.has(p)) {
            unique.push({ ...c, price: p });
            seen.add(p);
        }
    }

    // Build tiers
    const tiers = [];

    if (unique.length >= 1) {
        tiers.push({
            label: '第一目标 T1', price: unique[0].price,
            reason: unique[0].reason, action: '到达后减仓30%，锁定部分利润' });
    }
    if (unique.length >= 2) {
        tiers.push({
            label: '第二目标 T2', price: unique[1].price,
            reason: unique[1].reason, action: '到达后再减30%，剩余仓位移动止损至T1' });
    }
    if (unique.length >= 3) {
        tiers.push({
            label: '第三目标 T3', price: unique[2].price,
            reason: unique[2].reason, action: '剩余仓位移动止损跟随，择机清仓' });
    }
    if (unique.length >= 4) {
        tiers.push({
            label: '远期目标 T4', price: unique[unique.length - 1].price,
            reason: unique[unique.length - 1].reason, action: '极限目标，趋势延续可期待' });
    }

    // If not enough tiers from technical levels, add risk/reward based ones
    if (tiers.length < 2 && costPrice > 0) {
        const risk = Math.abs(currentPrice - costPrice);
        const rr15 = roundToTick(currentPrice + risk * 1.5);
        const rr20 = roundToTick(currentPrice + risk * 2.0);
        const rr30 = roundToTick(currentPrice + risk * 3.0);

        if (!seen.has(rr15) && rr15 > currentPrice) {
            tiers.push({ label: '盈亏比 1:1.5', price: rr15, reason: '基于当前风险回报比', action: '到达后减仓50%' });
        }
        if (!seen.has(rr20) && rr20 > currentPrice) {
            tiers.push({ label: '盈亏比 1:2', price: rr20, reason: '基于当前风险回报比', action: '到达后减仓50%' });
        }
        if (!seen.has(rr30) && rr30 > currentPrice) {
            tiers.push({ label: '盈亏比 1:3', price: rr30, reason: '基于当前风险回报比', action: '趋势延续目标' });
        }
    }

    // If no targets at all, fall back
    if (tiers.length === 0) {
        tiers.push({
            label: '基础目标', price: roundToTick(currentPrice * 1.1),
            reason: '无明确技术压力位，按10%涨幅估算', action: '到达后根据市场情况判断' });
    }

    const suggested = tiers[0].price;

    return {
        suggested: roundToTick(suggested),
        tiers,
    };
}

// ── Risk Assessment ──────────────────────────────────

export function assessRisk(klines, currentPrice, costPrice) {
    const ma5 = calcMa(klines, 5);
    const ma10 = calcMa(klines, 10);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);

    let score = 0;
    const warnings = [];

    // Trend check
    const isDeathCross = ma5 < ma10 && ma10 < ma20;
    const isLongBear = ma20 < ma60;
    if (isDeathCross && isLongBear) {
        score += 4;
        warnings.push('严重空头排列(MA5<MA10<MA20<MA60)');
    } else if (isDeathCross) {
        score += 2;
        warnings.push('短期均线空头排列');
    }
    if (currentPrice < ma20) {
        score += 1;
        warnings.push('股价低于MA20中期均线');
    }
    if (currentPrice < ma60) {
        score += 1;
        warnings.push('股价低于MA60长期均线');
    }

    // Position in range
    const recent = klines.slice(-Math.min(60, klines.length));
    const recentHigh = Math.max(...recent.map(k => k.high));
    const recentLow = Math.min(...recent.map(k => k.low));
    const position = recentHigh !== recentLow
        ? (currentPrice - recentLow) / (recentHigh - recentLow) * 100
        : 50;
    if (position < 20) {
        score += 2;
        warnings.push(`处于近60日低位区域(${round2(position)}%)，继续下探风险大`);
    } else if (position < 35) {
        score += 1;
        warnings.push(`处于近60日中低位区域(${round2(position)}%)`);
    }

    // Floating loss check
    if (costPrice > 0 && currentPrice < costPrice) {
        const lossPct = round2((costPrice - currentPrice) / costPrice * 100);
        if (lossPct > 10) {
            score += 3;
            warnings.push(`已亏损${lossPct}%，建议优先考虑止损，反弹至均线附近减仓`);
        } else if (lossPct > 5) {
            score += 2;
            warnings.push(`已亏损${lossPct}%，严格控制风险`);
        } else {
            score += 1;
            warnings.push(`浮亏${lossPct}%`);
        }
    }

    let level, badgeClass, suggestion;
    if (score >= 5) {
        level = '高风险';
        badgeClass = 'danger';
        suggestion = '不建议加仓，反弹至均线附近减仓，跌破近期低点直接离场';
    } else if (score >= 3) {
        level = '中等风险';
        badgeClass = 'warning';
        suggestion = '谨慎持有，严格控制止损，注意仓位管理';
    } else {
        level = '低风险';
        badgeClass = 'success';
        suggestion = '趋势健康，可正常操作，按目标位分批止盈';
    }

    return { level, score, warnings, suggestion, badgeClass };
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

    const stopLoss = suggestStopLoss(klines, currentPrice, costPrice);
    const takeProfit = suggestTakeProfit(klines, currentPrice, costPrice);
    const risk = assessRisk(klines, currentPrice, costPrice);

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

    // Position status
    let positionStatus;
    if (costPrice > 0 && currentPrice > 0) {
        const plPct = round2((currentPrice - costPrice) / costPrice * 100);
        if (plPct > 0) {
            positionStatus = `盈利 ${plPct > 0 ? '+' : ''}${plPct}%`;
        } else {
            positionStatus = `亏损 ${plPct}%`;
        }
    } else {
        positionStatus = '无持仓';
    }

    return {
        code,
        current_price: currentPrice,
        cost_price: costPrice,
        position_status: positionStatus,
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
        risk,
        trend,
        trend_class: trendClass,
        recent_high: roundToTick(recentHigh),
        recent_low: roundToTick(recentLow),
        position_in_range: positionInRange,
        data_days: klines.length,
    };
}
