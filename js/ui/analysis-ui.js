// Technical analysis page

import { getStockById, fetchKline, updateStock } from '../api.js';
import { analyze } from '../analysis.js';
import { formatPrice, textClass } from '../utils.js';

const content = document.getElementById('content');

function flash(msg, type = 'success') {
    const c = document.getElementById('flash-container');
    const el = document.createElement('div');
    el.className = `alert alert-${type} alert-dismissible fade show py-2`;
    el.innerHTML = `${msg}<button class="btn btn-close" data-bs-dismiss="alert"></button>`;
    c.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

async function render() {
    const params = new URLSearchParams(location.search);
    const id = parseInt(params.get('id'));
    if (!id) {
        content.innerHTML = '<div class="alert alert-danger">缺少股票ID参数</div>';
        return;
    }

    content.innerHTML = '获取K线数据<span class="spin ms-2"></span>';

    try {
        const stock = await getStockById(id);
        const klines = await fetchKline(stock.code, 60);

        if (!Array.isArray(klines) || klines.length < 14) {
            content.innerHTML = `<div class="alert alert-warning">
                数据不足（仅获取到${Array.isArray(klines) ? klines.length : 0}个交易日），至少需要14个交易日。
                <br><a href="stock-detail.html?id=${stock.id}" class="btn btn-sm btn-secondary mt-2">&larr; 返回</a>
            </div>`;
            return;
        }

        const result = analyze(stock.code, stock.current_price, stock.cost_price, klines);

        if (result.error) {
            content.innerHTML = `<div class="alert alert-warning">${result.error}<br>
                <a href="stock-detail.html?id=${stock.id}" class="btn btn-sm btn-secondary mt-2">&larr; 返回</a></div>`;
            return;
        }

        let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4>
                <span class="badge bg-light text-dark fs-6">${stock.code}</span> ${stock.name}
                <span class="badge bg-${result.trend_class}">${result.trend}</span>
            </h4>
            <a href="stock-detail.html?id=${stock.id}" class="btn btn-secondary btn-sm">&larr; 返回详情</a>
        </div>`;

        // Key indicators
        html += `<div class="row g-2 mb-4">
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">ATR(14)</small><div class="fw-bold">${formatPrice(result.atr)} (${result.atr_pct}%)</div></div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">MA5</small><div class="fw-bold ${textClass(stock.current_price, result.ma5)}">${formatPrice(result.ma5)}</div></div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">MA10</small><div class="fw-bold ${textClass(stock.current_price, result.ma10)}">${formatPrice(result.ma10)}</div></div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">MA20</small><div class="fw-bold ${textClass(stock.current_price, result.ma20)}">${formatPrice(result.ma20)}</div></div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">MA60</small><div class="fw-bold ${textClass(stock.current_price, result.ma60)}">${formatPrice(result.ma60)}</div></div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">区间位置</small><div class="fw-bold">${result.position_in_range}%<br><small class="text-muted">${formatPrice(result.recent_low)}-${formatPrice(result.recent_high)}</small></div></div></div></div>
        </div>`;

        // Support & Resistance
        html += '<div class="row g-3 mb-4"><div class="col-md-6">';
        html += '<div class="card"><div class="card-header"><strong><i class="bi bi-shield-check"></i> 支撑位</strong></div><div class="card-body">';
        if (result.supports.length > 0) {
            html += '<table class="table table-sm"><thead><tr><th>价格</th><th>触及次数</th><th>区间</th></tr></thead><tbody>';
            for (const s of result.supports) {
                html += `<tr><td class="fw-bold text-success">${formatPrice(s.price)}</td><td>${s.touches}次</td><td class="text-muted">${s.zone}</td></tr>`;
            }
            html += '</tbody></table>';
        } else { html += '<p class="text-muted">暂无支撑位数据</p>'; }
        html += '</div></div></div>';

        html += '<div class="col-md-6">';
        html += '<div class="card"><div class="card-header"><strong><i class="bi bi-shield-x"></i> 压力位</strong></div><div class="card-body">';
        if (result.resistances.length > 0) {
            html += '<table class="table table-sm"><thead><tr><th>价格</th><th>触及次数</th><th>区间</th></tr></thead><tbody>';
            for (const r of result.resistances) {
                html += `<tr><td class="fw-bold text-danger">${formatPrice(r.price)}</td><td>${r.touches}次</td><td class="text-muted">${r.zone}</td></tr>`;
            }
            html += '</tbody></table>';
        } else { html += '<p class="text-muted">暂无压力位数据</p>'; }
        html += '</div></div></div></div>';

        // Swing Points
        html += '<div class="row g-3 mb-4"><div class="col-md-6">';
        html += '<div class="card"><div class="card-header"><strong><i class="bi bi-arrow-up-circle"></i> 近期高（低）点</strong></div><div class="card-body"><div class="row"><div class="col-6"><small class="text-muted">高点</small>';
        for (const h of result.swing_highs) {
            html += `<div class="small"><span class="text-danger">${formatPrice(h.price)}</span> <span class="text-muted">${h.date}</span></div>`;
        }
        html += '</div><div class="col-6"><small class="text-muted">低点</small>';
        for (const l of result.swing_lows) {
            html += `<div class="small"><span class="text-success">${formatPrice(l.price)}</span> <span class="text-muted">${l.date}</span></div>`;
        }
        html += '</div></div></div></div>';

        // Consolidation
        html += '<div class="col-md-6">';
        html += '<div class="card"><div class="card-header"><strong><i class="bi bi-box"></i> 整理平台</strong></div><div class="card-body">';
        if (result.consolidation) {
            const c = result.consolidation;
            html += `<p>上沿: <span class="fw-bold text-danger">${formatPrice(c.upper)}</span> | 下沿: <span class="fw-bold text-success">${formatPrice(c.lower)}</span></p>
                <p class="text-muted small">振幅 ${c.range_pct}% | ATR ${formatPrice(c.atr)}</p>`;
        } else {
            html += '<p class="text-muted">未检测到明显整理平台</p>';
        }
        html += '</div></div></div></div>';

        // Stop-loss suggestion
        const sl = result.stop_loss;
        html += `<div class="card mb-4 border-danger"><div class="card-header bg-danger text-white"><strong><i class="bi bi-shield-minus"></i> 止损建议: ${formatPrice(sl.suggested)}</strong></div><div class="card-body">`;
        html += `<p class="small text-muted">ATR: ${formatPrice(sl.atr)} | ATR×2止损: ${formatPrice(sl.atr_stop)}</p>`;
        for (const d of sl.details) {
            html += `<div class="d-flex justify-content-between small mb-1"><span>${d.method}</span><span class="fw-bold text-danger">${formatPrice(d.price)}</span></div><div class="text-muted small mb-2">${d.reason}</div>`;
        }
        html += `<form id="apply-stop-form" class="mt-2"><input type="hidden" name="price" value="${sl.suggested}"><button type="submit" class="btn btn-danger btn-sm">应用止损价 ${formatPrice(sl.suggested)}</button></form></div></div>`;

        // Take-profit suggestion
        const tp = result.take_profit;
        html += `<div class="card mb-4 border-success"><div class="card-header bg-success text-white"><strong><i class="bi bi-shield-plus"></i> 止盈建议: ${formatPrice(tp.suggested)}</strong></div><div class="card-body">`;
        for (const d of tp.details) {
            html += `<div class="d-flex justify-content-between small mb-1"><span>${d.method}</span><span class="fw-bold text-success">${formatPrice(d.price)}</span></div><div class="text-muted small mb-2">${d.reason}</div>`;
        }
        html += `<form id="apply-profit-form" class="mt-2"><input type="hidden" name="price" value="${tp.suggested}"><button type="submit" class="btn btn-success btn-sm">应用止盈价 ${formatPrice(tp.suggested)}</button></form></div></div>`;

        html += `<div class="text-muted small mt-2">分析基于最近 ${result.data_days} 个交易日数据</div>`;

        content.innerHTML = html;

        // Apply stop-loss
        document.getElementById('apply-stop-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const price = parseFloat(e.target.price.value);
            try {
                await updateStock(stock.id, { stopLossPrice: price });
                flash(`已应用止损价 ${formatPrice(price)}`);
            } catch (err) { flash('应用失败: ' + err.message, 'danger'); }
        });

        // Apply take-profit
        document.getElementById('apply-profit-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const price = parseFloat(e.target.price.value);
            try {
                await updateStock(stock.id, { takeProfitPrice: price });
                flash(`已应用止盈价 ${formatPrice(price)}`);
            } catch (err) { flash('应用失败: ' + err.message, 'danger'); }
        });

    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}<br><a href="javascript:history.back()" class="btn btn-sm btn-secondary mt-2">&larr; 返回</a></div>`;
        console.error(e);
    }
}

render();
