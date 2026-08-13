// Technical analysis module — pure computation, framework-agnostic.
// Ported from analysis.py. Takes klines array as input, no network calls.
//
// Usage:
//   import { analyze } from './analysis.js';
//   const result = analyze('600519', 1850.00, 1800.00, klines);

// ── helpers ───────────────────────────────────────────

function round2(n) {
    return Math.round(n * 1000) / 1000;
}

function roundToTick(price) {
    if (price < 10) return round2(price);
    if (price < 100) return Math.round(price * 100) / 100;
    return Math.round(price * 10) / 10;
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

// ── Volume Trend ──────────────────────────────────────

export function calcVolumeTrend(klines) {
    if (klines.length < 20) return '量能数据不足';

    const recent5 = klines.slice(-5);
    const recent20 = klines.slice(-20);

    const avgVol5 = recent5.reduce((s, k) => s + (k.volume || 0), 0) / 5;
    const avgVol20 = recent20.reduce((s, k) => s + (k.volume || 0), 0) / 20;

    let upVol = 0, downVol = 0, upDays = 0, downDays = 0;
    for (const k of recent20) {
        if (k.close > k.open) {
            upVol += k.volume || 0;
            upDays++;
        } else if (k.close < k.open) {
            downVol += k.volume || 0;
            downDays++;
        }
    }

    const volRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 1;
    const upVolAvg = upDays > 0 ? upVol / upDays : 0;
    const downVolAvg = downDays > 0 ? downVol / downDays : 0;

    if (volRatio > 1.5 && upVolAvg > downVolAvg * 1.2) return '放量上涨';
    if (volRatio < 0.6) return '缩量调整';
    if (downVolAvg > upVolAvg * 1.3 && volRatio > 1) return '量价背离';
    return '量能正常';
}

// ── Entry Analysis (for watching stocks) ──────────────

export function analyzeEntry(klines, currentPrice) {
    if (klines.length < 14) {
        return { error: `数据不足（仅获取到${klines.length}个交易日），至少需要14个交易日` };
    }

    const days = Math.min(klines.length, 60);
    const atr = calcAtr(klines);
    const ma5 = calcMa(klines, 5);
    const ma10 = calcMa(klines, 10);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);
    const [supports, resistances] = findSupportResistance(klines);
    const [swingHighs, swingLows] = findSwingPoints(klines);
    const consolidation = findConsolidation(klines);
    const volumeTrend = calcVolumeTrend(klines);

    // Range
    const recentKlines = klines.slice(-days);
    const recentHigh = Math.max(...recentKlines.map(k => k.high));
    const recentLow = Math.min(...recentKlines.map(k => k.low));
    const positionInRange = recentHigh !== recentLow
        ? round2((currentPrice - recentLow) / (recentHigh - recentLow) * 100)
        : 50;

    // Nearest support & resistance
    const supportsBelow = supports.filter(s => s.price < currentPrice).sort((a, b) => b.price - a.price);
    const resistancesAbove = resistances.filter(r => r.price > currentPrice).sort((a, b) => a.price - b.price);
    const nearestSupport = supportsBelow.length > 0
        ? { price: supportsBelow[0].price, distance_pct: round2((currentPrice - supportsBelow[0].price) / currentPrice * 100) }
        : null;
    const nearestResistance = resistancesAbove.length > 0
        ? { price: resistancesAbove[0].price, distance_pct: round2((resistancesAbove[0].price - currentPrice) / currentPrice * 100) }
        : null;

    // ── Trend detection ──
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

    // ── Entry scoring ──
    const breakdown = [];
    const positives = [];
    const warnings = [];

    // Trend score (0-40)
    let trendScore;
    if (ma5 > ma10 && ma10 > ma20) {
        trendScore = ma5 > ma10 * 1.02 ? 40 : 35;
        positives.push('均线多头排列，趋势向上');
    } else if (ma5 > ma10 && ma10 <= ma20) {
        trendScore = 25;
        positives.push('短期均线转好，有走强迹象');
    } else if (ma5 < ma10 && ma10 < ma20) {
        trendScore = currentPrice > ma60 ? 10 : 5;
        warnings.push('均线空头排列，趋势向下');
    } else {
        trendScore = 18;
    }

    if (currentPrice < ma20) {
        trendScore = Math.max(0, trendScore - 8);
        warnings.push('股价低于MA20中期均线');
    }
    if (currentPrice < ma60 && ma60 > 0) {
        trendScore = Math.max(0, trendScore - 5);
        warnings.push('股价低于MA60长期均线');
    }
    if (ma20 < ma60 && ma20 > 0 && ma60 > 0) {
        trendScore = Math.max(0, trendScore - 3);
        warnings.push('MA20低于MA60，中长期偏弱');
    }
    trendScore = Math.max(0, Math.min(40, trendScore));
    breakdown.push({ label: '趋势', score: trendScore, max: 40, detail: trend });

    // Position score (0-30)
    let positionScore;
    if (nearestSupport && nearestSupport.distance_pct <= 3) {
        positionScore = 28;
        positives.push(`距支撑位 ${formatPriceShort(nearestSupport.price)} 仅${nearestSupport.distance_pct}%，回调空间有限`);
    } else if (nearestSupport && nearestSupport.distance_pct <= 6) {
        positionScore = 22;
    } else if (positionInRange < 30) {
        positionScore = 24;
        positives.push('处于区间低位，下行空间相对有限');
    } else if (positionInRange > 70) {
        positionScore = 8;
        warnings.push('处于区间高位，追高风险较大');
    } else {
        positionScore = 16;
    }

    if (nearestResistance && nearestResistance.distance_pct <= 3) {
        positionScore = Math.max(5, positionScore - 6);
        warnings.push(`距压力位 ${formatPriceShort(nearestResistance.price)} 仅${nearestResistance.distance_pct}%，上涨空间有限`);
    }
    positionScore = Math.max(0, Math.min(30, positionScore));
    breakdown.push({ label: '位置', score: positionScore, max: 30, detail: `区间${positionInRange}%位置` });

    // Volume score (0-20)
    let volumeScore;
    switch (volumeTrend) {
        case '放量上涨': volumeScore = 18; positives.push('近期放量上涨，资金介入明显'); break;
        case '量能正常': volumeScore = 13; break;
        case '缩量调整': volumeScore = 8; warnings.push('成交量萎缩，市场关注度低'); break;
        case '量价背离': volumeScore = 4; warnings.push('量价背离，上涨动力不足'); break;
        default: volumeScore = 10;
    }
    breakdown.push({ label: '量能', score: volumeScore, max: 20, detail: volumeTrend });

    // Pattern score (0-10)
    let patternScore;
    if (consolidation) {
        const distToLower = round2((currentPrice - consolidation.lower) / currentPrice * 100);
        const distToUpper = round2((consolidation.upper - currentPrice) / currentPrice * 100);
        if (distToLower <= 3) {
            patternScore = 9;
            positives.push(`盘整平台下沿附近(${consolidation.range_pct}%振幅)，支撑明确`);
        } else if (distToUpper <= 3) {
            patternScore = 3;
            warnings.push('接近盘整平台上沿，突破前不宜追高');
        } else {
            patternScore = 6;
        }
    } else if (supportsBelow.length >= 2) {
        patternScore = 6;
    } else {
        patternScore = 4;
    }
    breakdown.push({ label: '形态', score: patternScore, max: 10, detail: consolidation ? `盘整区间 ${formatPriceShort(consolidation.lower)}-${formatPriceShort(consolidation.upper)}` : '无明确形态' });

    // Total score
    const entryScore = trendScore + positionScore + volumeScore + patternScore;

    // Entry level
    let entryLevel, entryLabel, entryBadgeClass;
    if (entryScore >= 70) {
        entryLevel = 'suitable'; entryLabel = '可考虑建仓'; entryBadgeClass = 'success';
    } else if (entryScore >= 40) {
        entryLevel = 'cautious'; entryLabel = '谨慎关注'; entryBadgeClass = 'warning';
    } else {
        entryLevel = 'wait'; entryLabel = '建议观望'; entryBadgeClass = 'danger';
    }

    // ── Suggested entry zones ──
    const zones = [];
    if (nearestSupport) {
        zones.push({
            price: nearestSupport.price,
            label: '最佳买点',
            reason: `最近支撑位，触及${supportsBelow[0].touches}次，回调至此可大胆买入`,
        });
    }
    if (ma20 > 0 && ma20 < currentPrice && (!nearestSupport || Math.abs(ma20 - nearestSupport.price) / nearestSupport.price > 0.02)) {
        zones.push({
            price: ma20,
            label: '均线回调位',
            reason: '回调至MA20中期均线，趋势不变时是较好买点',
        });
    }
    if (consolidation && consolidation.lower < currentPrice) {
        const alreadyAdded = zones.some(z => Math.abs(z.price - consolidation.lower) / consolidation.lower < 0.02);
        if (!alreadyAdded) {
            zones.push({
                price: consolidation.lower,
                label: '平台下沿',
                reason: `整理平台下沿(${consolidation.range_pct}%振幅)，支撑有效时可介入`,
            });
        }
    }
    if (entryScore >= 60) {
        zones.push({
            price: currentPrice,
            label: '现价分批',
            reason: '评分尚可，可现价小仓位试探，回调加仓',
        });
    }
    // Fallback
    if (zones.length === 0 && nearestSupport) {
        zones.push({
            price: nearestSupport.price,
            label: '参考买点',
            reason: '无其他技术位，以最近支撑为参考',
        });
    }
    if (zones.length === 0) {
        zones.push({
            price: roundToTick(currentPrice * 0.95),
            label: '保守参考',
            reason: '缺乏明确技术位，按现价95%估算',
        });
    }

    // ── Risk/Reward ──
    const riskPct = nearestSupport ? nearestSupport.distance_pct : round2((currentPrice - recentLow) / currentPrice * 100);
    const rewardPct = nearestResistance ? nearestResistance.distance_pct : round2((recentHigh - currentPrice) / currentPrice * 100);
    const rrRatio = riskPct > 0 ? round2(rewardPct / riskPct) : 0;

    return {
        trend, trend_class: trendClass,
        ma5: roundToTick(ma5), ma10: roundToTick(ma10), ma20: roundToTick(ma20), ma60: roundToTick(ma60),
        atr: roundToTick(atr), atr_pct: currentPrice ? round2(atr / currentPrice * 100) : 0,
        position_in_range: positionInRange,
        recent_high: roundToTick(recentHigh), recent_low: roundToTick(recentLow),
        supports: supportsBelow.slice(0, 5),
        resistances: resistancesAbove.slice(0, 5),
        nearest_support: nearestSupport,
        nearest_resistance: nearestResistance,
        volume_trend: volumeTrend,
        consolidation,
        entry_score: entryScore,
        entry_level: entryLevel,
        entry_label: entryLabel,
        entry_badge_class: entryBadgeClass,
        score_breakdown: breakdown,
        suggested_zones: zones,
        risk_reward: { risk_pct: riskPct, reward_pct: rewardPct, ratio: rrRatio },
        warnings,
        positives,
        data_days: klines.length,
    };
}

function formatPriceShort(price) {
    if (price < 10) return price.toFixed(2);
    if (price < 100) return price.toFixed(1);
    return String(Math.round(price));
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

// ── Add-Position Analysis (for held stocks) ───────────

export function analyzeAdd(klines, currentPrice, costPrice) {
    if (klines.length < 14) {
        return { error: `数据不足（仅获取到${klines.length}个交易日），至少需要14个交易日` };
    }

    const days = Math.min(klines.length, 60);
    const atr = calcAtr(klines);
    const ma5 = calcMa(klines, 5);
    const ma10 = calcMa(klines, 10);
    const ma20 = calcMa(klines, 20);
    const ma60 = calcMa(klines, 60);
    const [supports, resistances] = findSupportResistance(klines);
    const [swingHighs, swingLows] = findSwingPoints(klines);
    const consolidation = findConsolidation(klines);
    const volumeTrend = calcVolumeTrend(klines);

    const recentKlines = klines.slice(-days);
    const recentHigh = Math.max(...recentKlines.map(k => k.high));
    const recentLow = Math.min(...recentKlines.map(k => k.low));
    const positionInRange = recentHigh !== recentLow
        ? round2((currentPrice - recentLow) / (recentHigh - recentLow) * 100)
        : 50;

    const supportsBelow = supports.filter(s => s.price < currentPrice).sort((a, b) => b.price - a.price);
    const resistancesAbove = resistances.filter(r => r.price > currentPrice).sort((a, b) => a.price - b.price);
    const nearestSupport = supportsBelow.length > 0
        ? { price: supportsBelow[0].price, distance_pct: round2((currentPrice - supportsBelow[0].price) / currentPrice * 100) }
        : null;
    const nearestResistance = resistancesAbove.length > 0
        ? { price: resistancesAbove[0].price, distance_pct: round2((resistancesAbove[0].price - currentPrice) / currentPrice * 100) }
        : null;

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

    const breakdown = [];
    const positives = [];
    const warnings = [];

    // Trend score (0-30)
    let trendScore;
    if (ma5 > ma10 && ma10 > ma20) {
        trendScore = ma5 > ma10 * 1.02 ? 30 : 26;
        positives.push('均线多头排列，趋势向上');
    } else if (ma5 > ma10 && ma10 <= ma20) {
        trendScore = 19;
        positives.push('短期均线转好，有走强迹象');
    } else if (ma5 < ma10 && ma10 < ma20) {
        trendScore = currentPrice > ma60 ? 8 : 4;
        warnings.push('均线空头排列，趋势向下');
    } else {
        trendScore = 14;
    }
    if (currentPrice < ma20) {
        trendScore = Math.max(0, trendScore - 6);
        warnings.push('股价低于MA20中期均线');
    }
    if (currentPrice < ma60 && ma60 > 0) {
        trendScore = Math.max(0, trendScore - 4);
        warnings.push('股价低于MA60长期均线');
    }
    if (ma20 < ma60 && ma20 > 0 && ma60 > 0) {
        trendScore = Math.max(0, trendScore - 3);
        warnings.push('MA20低于MA60，中长期偏弱');
    }
    trendScore = Math.max(0, Math.min(30, trendScore));
    breakdown.push({ label: '趋势', score: trendScore, max: 30, detail: trend });

    // Position score (0-25)
    let positionScore;
    if (nearestSupport && nearestSupport.distance_pct <= 3) {
        positionScore = 24;
        positives.push(`距支撑位 ${formatPriceShort(nearestSupport.price)} 仅${nearestSupport.distance_pct}%，回调空间有限`);
    } else if (nearestSupport && nearestSupport.distance_pct <= 6) {
        positionScore = 19;
    } else if (positionInRange < 30) {
        positionScore = 20;
        positives.push('处于区间低位，下行空间相对有限');
    } else if (positionInRange > 70) {
        positionScore = 6;
        warnings.push('处于区间高位，追高风险较大');
    } else {
        positionScore = 13;
    }
    if (nearestResistance && nearestResistance.distance_pct <= 3) {
        positionScore = Math.max(4, positionScore - 5);
        warnings.push(`距压力位 ${formatPriceShort(nearestResistance.price)} 仅${nearestResistance.distance_pct}%，上涨空间有限`);
    }
    positionScore = Math.max(0, Math.min(25, positionScore));
    breakdown.push({ label: '位置', score: positionScore, max: 25, detail: `区间${positionInRange}%位置` });

    // Volume score (0-15)
    let volumeScore;
    switch (volumeTrend) {
        case '放量上涨': volumeScore = 14; positives.push('近期放量上涨，资金介入明显'); break;
        case '量能正常': volumeScore = 10; break;
        case '缩量调整': volumeScore = 6; warnings.push('成交量萎缩，市场关注度低'); break;
        case '量价背离': volumeScore = 3; warnings.push('量价背离，上涨动力不足'); break;
        default: volumeScore = 8;
    }
    breakdown.push({ label: '量能', score: volumeScore, max: 15, detail: volumeTrend });

    // Profit/loss score (0-20)
    const plPct = costPrice > 0 ? round2((currentPrice - costPrice) / costPrice * 100) : 0;
    let costScore, costDetail;
    if (costPrice <= 0) {
        costScore = 12;
        costDetail = '无成本价，按中性处理';
    } else if (plPct >= 5) {
        costScore = 20;
        costDetail = `盈利 +${plPct}%，顺势加仓较安全`;
        positives.push(`当前盈利 +${plPct}%，顺势加仓`);
    } else if (plPct >= 0) {
        costScore = 16;
        costDetail = `盈利 +${plPct}%，可小幅加仓`;
    } else if (plPct >= -5) {
        costScore = 9;
        costDetail = `浮亏 ${Math.abs(plPct)}%，不建议摊平成本`;
        warnings.push(`浮亏 ${Math.abs(plPct)}%，加仓会摊低成本但也放大风险`);
    } else if (plPct >= -10) {
        costScore = 4;
        costDetail = `浮亏 ${Math.abs(plPct)}%，中度亏损，控制加仓`;
        warnings.push(`浮亏 ${Math.abs(plPct)}%，不建议加仓摊平，先观察支撑`);
    } else {
        costScore = 0;
        costDetail = `浮亏 ${Math.abs(plPct)}%，深度亏损，坚决不加仓`;
        warnings.push(`深度亏损 ${Math.abs(plPct)}%，优先止损而非加仓`);
    }
    breakdown.push({ label: '盈亏状态', score: costScore, max: 20, detail: costDetail });

    // Pattern score (0-10)
    let patternScore;
    if (consolidation) {
        const distToLower = round2((currentPrice - consolidation.lower) / currentPrice * 100);
        const distToUpper = round2((consolidation.upper - currentPrice) / currentPrice * 100);
        if (distToLower <= 3) {
            patternScore = 9;
            positives.push(`盘整平台下沿附近(${consolidation.range_pct}%振幅)，支撑明确`);
        } else if (distToUpper <= 3) {
            patternScore = 3;
            warnings.push('接近盘整平台上沿，突破前不宜加仓');
        } else {
            patternScore = 6;
        }
    } else if (supportsBelow.length >= 2) {
        patternScore = 6;
    } else {
        patternScore = 4;
    }
    breakdown.push({ label: '形态', score: patternScore, max: 10, detail: consolidation ? `盘整区间 ${formatPriceShort(consolidation.lower)}-${formatPriceShort(consolidation.upper)}` : '无明确形态' });

    const addScore = trendScore + positionScore + volumeScore + costScore + patternScore;

    let addLabel, addBadgeClass;
    if (addScore >= 70) {
        addLabel = '建议加仓';
        addBadgeClass = 'success';
    } else if (addScore >= 45) {
        addLabel = '谨慎加仓';
        addBadgeClass = 'warning';
    } else {
        addLabel = '不建议加仓';
        addBadgeClass = 'danger';
    }

    // Suggested add zones
    const zones = [];
    if (nearestSupport) {
        zones.push({
            price: nearestSupport.price,
            label: '最佳加仓点',
            reason: `最近支撑位，触及${supportsBelow[0].touches}次，回调至此加仓风险较小`,
        });
    }
    if (ma20 > 0 && ma20 < currentPrice && (!nearestSupport || Math.abs(ma20 - nearestSupport.price) / nearestSupport.price > 0.02)) {
        zones.push({
            price: ma20,
            label: '均线回调位',
            reason: '回调至MA20中期均线，趋势不变时是较好加仓点',
        });
    }
    if (consolidation && consolidation.lower < currentPrice) {
        const alreadyAdded = zones.some(z => Math.abs(z.price - consolidation.lower) / consolidation.lower < 0.02);
        if (!alreadyAdded) {
            zones.push({
                price: consolidation.lower,
                label: '平台下沿',
                reason: `整理平台下沿(${consolidation.range_pct}%振幅)，支撑有效时可加仓`,
            });
        }
    }
    if (addScore >= 60 && plPct >= 0) {
        zones.push({
            price: currentPrice,
            label: '现价分批',
            reason: '趋势与盈亏尚可，可现价小仓位加仓，回调继续加',
        });
    }
    if (zones.length === 0 && nearestSupport) {
        zones.push({ price: nearestSupport.price, label: '参考加仓点', reason: '无其他技术位，以最近支撑为参考' });
    }
    if (zones.length === 0) {
        zones.push({ price: roundToTick(currentPrice * 0.95), label: '保守参考', reason: '缺乏明确技术位，按现价95%估算' });
    }

    const riskPct = nearestSupport ? nearestSupport.distance_pct : round2((currentPrice - recentLow) / currentPrice * 100);
    const rewardPct = nearestResistance ? nearestResistance.distance_pct : round2((recentHigh - currentPrice) / currentPrice * 100);
    const rrRatio = riskPct > 0 ? round2(rewardPct / riskPct) : 0;

    return {
        trend, trend_class: trendClass,
        ma5: roundToTick(ma5), ma10: roundToTick(ma10), ma20: roundToTick(ma20), ma60: roundToTick(ma60),
        atr: roundToTick(atr), atr_pct: currentPrice ? round2(atr / currentPrice * 100) : 0,
        position_in_range: positionInRange,
        recent_high: roundToTick(recentHigh), recent_low: roundToTick(recentLow),
        supports: supportsBelow.slice(0, 5),
        resistances: resistancesAbove.slice(0, 5),
        nearest_support: nearestSupport,
        nearest_resistance: nearestResistance,
        volume_trend: volumeTrend,
        consolidation,
        pl_pct: plPct,
        add_score: addScore,
        add_label: addLabel,
        add_badge_class: addBadgeClass,
        score_breakdown: breakdown,
        suggested_zones: zones,
        risk_reward: { risk_pct: riskPct, reward_pct: rewardPct, ratio: rrRatio },
        warnings,
        positives,
        data_days: klines.length,
    };
}
