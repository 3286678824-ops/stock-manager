// Technical analysis page

import { getStockById, fetchKlineCached, updateStock, fetchStockNews } from '../api.js';
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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

async function render() {
    const params = new URLSearchParams(location.search);
    const id = parseInt(params.get('id'));
    if (!id) {
        content.innerHTML = '<div class="alert alert-danger">缺少股票ID参数</div>';
        return;
    }

    content.innerHTML = '获取数据<span class="spin ms-2"></span>';

    try {
        const stock = await getStockById(id);

        // Show loading state then fetch kline (cached if available)
        content.innerHTML = `获取 ${stock.name}(${stock.code}) K线数据<span class="spin ms-2"></span>`;
        const klines = await fetchKlineCached(stock.code, 60);

        if (!Array.isArray(klines) || klines.length < 14) {
            const dayCount = Array.isArray(klines) ? klines.length : 0;

            // Fetch news for this stock
            let newsHtml = '<p class="text-muted text-center py-3">正在获取相关资讯...</p>';
            try {
                const news = await fetchStockNews(stock.code);
                if (news && news.length > 0) {
                    const items = news.map(n => `
                    <a href="${n.url || '#'}" target="_blank" rel="noopener" class="list-group-item list-group-item-action py-2 px-3">
                        <div class="d-flex w-100 justify-content-between align-items-start gap-2">
                            <span class="news-title text-truncate" style="max-width:75%;">${escapeHtml(n.title || '')}</span>
                            <small class="text-muted text-nowrap">${n.date || ''}</small>
                        </div>
                        <span class="badge bg-light text-dark mt-1">${escapeHtml(n.source || '资讯')}</span>
                    </a>`).join('');
                    newsHtml = `<div class="list-group list-group-flush" style="max-height:480px;overflow-y:auto;">${items}</div>`;
                } else {
                    newsHtml = '<p class="text-muted text-center py-3">暂无相关资讯</p>';
                }
            } catch {
                newsHtml = '<p class="text-muted text-center py-3">资讯获取失败</p>';
            }

            content.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4><span class="badge bg-light text-dark">${stock.code}</span> ${stock.name}</h4>
                <a href="stock-detail?id=${stock.id}" class="btn btn-secondary btn-sm">&larr; 返回详情</a>
            </div>
            <div class="alert alert-warning py-2">
                <i class="bi bi-exclamation-triangle"></i> 数据不足（仅获取到${dayCount}个交易日），至少需要14个交易日进行技术分析。以下是最新公告资讯，帮助了解该标的近期动态：
            </div>
            <div class="card mb-4">
                <div class="card-header"><strong><i class="bi bi-newspaper"></i> 最新公告与资讯</strong></div>
                ${newsHtml}
            </div>
            <div class="mt-3"><a href="stock-detail?id=${stock.id}" class="btn btn-secondary btn-sm">&larr; 返回详情</a></div>`;
            return;
        }

        const result = analyze(stock.code, stock.current_price, stock.cost_price, klines);

        if (result.error) {
            content.innerHTML = `<div class="alert alert-warning">${result.error}<br>
                <a href="stock-detail?id=${stock.id}" class="btn btn-sm btn-secondary mt-2">&larr; 返回</a></div>`;
            return;
        }

        let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4>
                <span class="badge bg-light text-dark fs-6">${stock.code}</span> ${stock.name}
                <span class="badge bg-${result.trend_class}">${result.trend}</span>
            </h4>
            <a href="stock-detail?id=${stock.id}" class="btn btn-secondary btn-sm">&larr; 返回详情</a>
        </div>`;

        // Price & Stop/Profit comparison card
        const curStop = stock.stop_loss_price ? formatPrice(stock.stop_loss_price) : '<span class="text-muted">未设</span>';
        const curProfit = stock.take_profit_price ? formatPrice(stock.take_profit_price) : '<span class="text-muted">未设</span>';
        const slDiff = stock.stop_loss_price ? ((result.stop_loss.suggested - stock.stop_loss_price) / stock.stop_loss_price * 100).toFixed(1) : null;
        const tpDiff = stock.take_profit_price ? ((result.take_profit.suggested - stock.take_profit_price) / stock.take_profit_price * 100).toFixed(1) : null;

        html += `<div class="card mb-4">
            <div class="card-header"><strong><i class="bi bi-arrow-left-right"></i> 现价与止盈止损对照</strong></div>
            <div class="card-body">
                <div class="row g-3 text-center">
                    <div class="col-md-3 col-6">
                        <small class="text-muted">现价</small>
                        <div class="fs-4 fw-bold text-primary">${formatPrice(stock.current_price)}</div>
                    </div>
                    <div class="col-md-3 col-6">
                        <small class="text-muted">成本价</small>
                        <div class="fs-5 fw-bold">${formatPrice(stock.cost_price)}</div>
                        <small class="${textClass(stock.current_price, stock.cost_price)}">${((stock.current_price - stock.cost_price) / stock.cost_price * 100).toFixed(1)}%</small>
                    </div>
                    <div class="col-md-3 col-6">
                        <small class="text-muted">止损价</small>
                        <div class="d-flex justify-content-center align-items-center gap-1 flex-wrap">
                            <span class="badge bg-light text-dark">当前 ${curStop}</span>
                            <i class="bi bi-arrow-right text-muted"></i>
                            <span class="badge bg-danger">建议 ${formatPrice(result.stop_loss.suggested)}</span>
                        </div>
                        ${slDiff !== null ? `<small class="${slDiff > 0 ? 'text-danger' : 'text-success'}">建议${slDiff > 0 ? '上调' : '下调'} ${Math.abs(slDiff)}%</small>` : ''}
                    </div>
                    <div class="col-md-3 col-6">
                        <small class="text-muted">止盈价</small>
                        <div class="d-flex justify-content-center align-items-center gap-1 flex-wrap">
                            <span class="badge bg-light text-dark">当前 ${curProfit}</span>
                            <i class="bi bi-arrow-right text-muted"></i>
                            <span class="badge bg-success">建议 ${formatPrice(result.take_profit.suggested)}</span>
                        </div>
                        ${tpDiff !== null ? `<small class="${tpDiff > 0 ? 'text-success' : 'text-danger'}">建议${tpDiff > 0 ? '上调' : '下调'} ${Math.abs(tpDiff)}%</small>` : ''}
                    </div>
                </div>
            </div>
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

        // Risk assessment card
        const risk = result.risk;
        html += `<div class="card mb-4 border-${risk.badgeClass}"><div class="card-header bg-${risk.badgeClass} text-white d-flex justify-content-between align-items-center">
            <strong><i class="bi bi-exclamation-triangle"></i> 风险评估: ${risk.level}</strong>
            <span>${result.position_status}</span>
        </div><div class="card-body">
            <p class="mb-2"><strong>建议：</strong>${risk.suggestion}</p>`;
        if (risk.warnings.length > 0) {
            html += '<ul class="mb-0 small">';
            for (const w of risk.warnings) {
                html += `<li class="text-danger">${w}</li>`;
            }
            html += '</ul>';
        }
        html += '</div></div>';

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

        // Multi-layer stop-loss
        const sl = result.stop_loss;
        const slAmplitude = ((stock.current_price - sl.suggested) / stock.current_price * 100).toFixed(1);
        html += `<div class="card mb-4 border-danger"><div class="card-header bg-danger text-white"><strong><i class="bi bi-shield-minus"></i> 多层止损体系</strong></div><div class="card-body">`;

        // Recommended stop
        html += `<div class="alert alert-danger py-2 mb-3"><strong>推荐执行价: ${formatPrice(sl.suggested)}</strong> (止损幅度 ${slAmplitude}%)</div>`;

        // Layer table
        html += '<table class="table table-sm table-hover mb-0"><thead class="table-light"><tr><th>层级</th><th>方法</th><th class="text-end">止损价</th><th>说明</th></tr></thead><tbody>';
        for (const l of sl.layers) {
            const isRecommended = l.price === sl.suggested;
            const rowClass = isRecommended ? 'table-danger' : '';
            const badge = isRecommended ? ' <span class="badge bg-danger">推荐</span>' : '';
            html += `<tr class="${rowClass}">
                <td><span class="badge bg-secondary">${l.level}</span></td>
                <td>${l.method}${badge}</td>
                <td class="text-end fw-bold">${formatPrice(l.price)}</td>
                <td class="small text-muted">${l.reason}</td>
            </tr>`;
        }
        html += '</tbody></table>';

        // Trend warnings
        if (sl.trend_warnings && sl.trend_warnings.length > 0) {
            html += '<div class="mt-3">';
            for (const w of sl.trend_warnings) {
                html += `<p class="text-warning small mb-1"><i class="bi bi-exclamation-circle"></i> ${w}</p>`;
            }
            html += '</div>';
        }

        html += `<form id="apply-stop-form" class="mt-2 d-flex gap-2"><input type="hidden" name="price" value="${sl.suggested}"><button type="submit" class="btn btn-danger btn-sm">应用推荐止损价 ${formatPrice(sl.suggested)}</button></form></div></div>`;

        // Multi-tier take-profit
        const tp = result.take_profit;
        html += `<div class="card mb-4 border-success"><div class="card-header bg-success text-white"><strong><i class="bi bi-shield-plus"></i> 分级止盈体系</strong></div><div class="card-body">`;

        html += '<table class="table table-sm table-hover mb-0"><thead class="table-light"><tr><th>目标</th><th class="text-end">价格</th><th>涨幅</th><th>依据</th><th>操作建议</th></tr></thead><tbody>';
        for (const t of tp.tiers) {
            const gainPct = ((t.price - stock.current_price) / stock.current_price * 100).toFixed(1);
            const isFirst = t === tp.tiers[0];
            const rowClass = isFirst ? 'table-success' : '';
            html += `<tr class="${rowClass}">
                <td><span class="badge bg-${isFirst ? 'success' : 'info'}">${t.label}</span></td>
                <td class="text-end fw-bold text-success">${formatPrice(t.price)}</td>
                <td class="text-success">+${gainPct}%</td>
                <td class="small text-muted">${t.reason}</td>
                <td class="small">${t.action || ''}</td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += `<form id="apply-profit-form" class="mt-2 d-flex gap-2"><input type="hidden" name="price" value="${tp.suggested}"><button type="submit" class="btn btn-success btn-sm">应用第一目标止盈 ${formatPrice(tp.suggested)}</button></form></div></div>`;

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
