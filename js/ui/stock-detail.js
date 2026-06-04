// Stock detail page

import { getStockById, getStocksByPortfolio, getTradesByStock, getSnapshots } from '../api.js';
import { stopLossStatus, marketValue, costValue, profitLoss, profitLossPct, dayChangePct, statusColor } from '../computations.js';
import { formatPrice, formatPct, actionLabel, actionBadgeClass, textClass, bgClass, statusLabel, statusBadgeClass } from '../utils.js';

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

    try {
        const stock = await getStockById(id);
        const siblings = await getStocksByPortfolio(stock.portfolio_id);
        const trades = await getTradesByStock(id);
        const snapshots = await getSnapshots(id, 10);

        const status = stopLossStatus(stock.current_price, stock.stop_loss_price, stock.take_profit_price);
        const mv = marketValue(stock.current_price, stock.quantity);
        const cv = costValue(stock.cost_price, stock.quantity);
        const pl = profitLoss(mv, cv);
        const plPct = profitLossPct(stock.current_price, stock.cost_price);
        const dcPct = dayChangePct(stock.current_price, stock.prev_close_price);

        const statusBadge = stock.status === 'holding'
            ? '<span class="badge bg-success">持有</span>'
            : stock.status === 'watching'
                ? '<span class="badge bg-info">关注</span>'
                : '<span class="badge bg-secondary">已卖出</span>';

        // Sibling dropdown
        let siblingHtml = '';
        if (siblings.length > 1) {
            const items = siblings.map(s => {
                const sStatus = stopLossStatus(s.current_price, s.stop_loss_price, s.take_profit_price);
                const color = statusColor(sStatus);
                const opacity = sStatus === 'normal' ? '0.3' : '1';
                const active = s.id === stock.id ? ' active' : '';
                const check = s.id === stock.id ? ' <i class="bi bi-check2"></i>' : '';
                return `<li><a class="dropdown-item d-flex justify-content-between align-items-center${active}" href="stock-detail.html?id=${s.id}">
                    <span>
                        <span class="d-inline-block rounded-circle me-1 bg-${color}" style="width:8px;height:8px;vertical-align:middle;opacity:${opacity};"></span>
                        <span class="badge bg-light text-dark me-1">${s.code}</span>${s.name}
                    </span>${check}
                </a></li>`;
            }).join('');
            siblingHtml = `
            <div class="dropdown">
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" title="切换标的">
                    <i class="bi bi-arrow-left-right"></i>
                </button>
                <ul class="dropdown-menu" style="max-height:300px;overflow-y:auto;">${items}</ul>
            </div>`;
        }

        // Stop/profit bar
        let stopProfitHtml = '';
        if (stock.stop_loss_price || stock.take_profit_price) {
            const minP = stock.stop_loss_price || (stock.cost_price * 0.8);
            const maxP = stock.take_profit_price || (stock.cost_price * 1.2);
            const range = maxP - minP;
            let pct = 50;
            if (range > 0) {
                pct = Math.round((stock.current_price - minP) / range * 100);
                if (pct < 2) pct = 2;
                if (pct > 98) pct = 98;
            }
            stopProfitHtml = `
            <div class="card mb-4">
                <div class="card-header"><strong><i class="bi bi-flag"></i> 止损止盈区间</strong></div>
                <div class="card-body">
                    <div class="d-flex justify-content-between small text-muted mb-1">
                        <span>止损 ${formatPrice(stock.stop_loss_price) || '-'}</span>
                        <span>现价 ${formatPrice(stock.current_price)}</span>
                        <span>止盈 ${formatPrice(stock.take_profit_price) || '-'}</span>
                    </div>
                    <div class="progress" style="height:20px;">
                        <div class="progress-bar bg-danger" style="width:${pct}%"></div>
                        <div class="progress-bar bg-success" style="width:${100-pct}%"></div>
                    </div>
                    <div class="text-center mt-2">
                        <span class="badge bg-${statusBadgeClass(status)}">${statusLabel(status)}</span>
                    </div>
                </div>
            </div>`;
        }

        // Snapshots table
        let snapshotHtml = '';
        if (snapshots.length > 0) {
            const rows = snapshots.map(snap => {
                const diff = plPct - snap.profit_loss_pct_snapshot;
                const diffStr = (diff >= 0 ? '+' : '') + formatPrice(diff) + '%';
                return `<tr>
                    <td>${snap.date}</td>
                    <td class="text-end">${formatPrice(snap.close_price)}</td>
                    <td class="text-end d-none d-md-table-cell">${formatPrice(snap.cost_price_snapshot)}</td>
                    <td class="text-end d-none d-md-table-cell">${snap.quantity_snapshot}</td>
                    <td class="text-end">${formatPrice(snap.market_value_snapshot)}</td>
                    <td class="text-end ${textClass(snap.profit_loss_pct_snapshot)}">${formatPrice(snap.profit_loss_pct_snapshot)}%</td>
                    <td><span class="${textClass(diff)}">${diffStr}</span></td>
                </tr>`;
            }).join('');
            snapshotHtml = `
            <h5 class="mb-3"><i class="bi bi-camera"></i> 历史每日快照</h5>
            <div class="table-responsive mb-4">
                <table class="table table-sm table-hover">
                    <thead class="table-light">
                        <tr><th>日期</th><th class="text-end">收盘价</th><th class="text-end d-none d-md-table-cell">成本价</th><th class="text-end d-none d-md-table-cell">数量</th><th class="text-end">市值</th><th class="text-end">收益率</th><th>对比今日</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        } else {
            snapshotHtml = `
            <div class="text-center text-muted py-4 mb-4">
                <p><i class="bi bi-camera" style="font-size:1.5rem;"></i></p>
                <p>暂无历史快照</p>
                <p class="small">点击"刷新行情"将自动保存今日快照，多天积累后可对比走势</p>
            </div>`;
        }

        // Trades table
        let tradesHtml = '';
        if (trades.length > 0) {
            const rows = trades.map(t => `<tr>
                <td class="text-nowrap">${new Date(t.created_at).toLocaleString('zh-CN', {hour12: false})}</td>
                <td><span class="badge ${actionBadgeClass(t.action)}">${actionLabel(t.action)}</span></td>
                <td class="text-end">${formatPrice(t.price)}</td>
                <td class="text-end">${t.quantity}</td>
                <td class="text-muted small">${t.note || ''}</td>
            </tr>`).join('');
            tradesHtml = `
            <h5 class="mb-3"><i class="bi bi-clock-history"></i> 操作记录</h5>
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead class="table-light"><tr><th>时间</th><th>操作</th><th class="text-end">价格</th><th class="text-end">数量</th><th>备注</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        } else {
            tradesHtml = '<div class="text-center text-muted py-3"><p>暂无操作记录</p></div>';
        }

        content.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
                ${siblingHtml}
                <h4 class="mb-0 fs-5 fs-md-4">
                    <span class="badge bg-light text-dark">${stock.code}</span> ${stock.name} ${statusBadge}
                </h4>
            </div>
            <div class="d-flex flex-wrap gap-1">
                <a href="analysis.html?id=${stock.id}" class="btn btn-info btn-sm"><i class="bi bi-lightbulb"></i> 分析</a>
                <a href="trade-form.html?id=${stock.id}" class="btn btn-success btn-sm"><i class="bi bi-pencil-square"></i> 操作</a>
                <a href="stock-form.html?id=${stock.id}" class="btn btn-outline-warning btn-sm"><i class="bi bi-gear"></i> 编辑</a>
            </div>
        </div>

        <div class="row g-2 mb-4">
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">成本价</small><div class="fw-bold">${formatPrice(stock.cost_price)}</div>
            </div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">现价</small><div class="fw-bold ${textClass(stock.current_price, stock.cost_price)}">${formatPrice(stock.current_price)}</div>
            </div></div></div>
            <div class="col-md-2 col-6"><div class="card text-bg-light"><div class="card-body text-center py-2">
                <small class="text-muted">昨收</small><div class="fw-bold">${formatPrice(stock.prev_close_price)}</div>
            </div></div></div>
            <div class="col-md-2 col-6"><div class="card ${bgClass(dcPct)}"><div class="card-body text-center py-2">
                <small class="text-white-50">今日涨跌</small><div class="fw-bold">${formatPct(dcPct)}</div>
            </div></div></div>
            <div class="col-md-2 col-6"><div class="card ${bgClass(pl)}"><div class="card-body text-center py-2">
                <small class="text-white-50">总盈亏</small><div class="fw-bold">${formatPrice(pl)}</div>
            </div></div></div>
            <div class="col-md-2 col-6"><div class="card ${bgClass(plPct)}"><div class="card-body text-center py-2">
                <small class="text-white-50">收益率</small><div class="fw-bold">${formatPrice(plPct)}%</div>
            </div></div></div>
        </div>

        ${stopProfitHtml}
        ${snapshotHtml}
        ${tradesHtml}

        <div class="mt-3"><a href="index.html?pid=${stock.portfolio_id}" class="btn btn-secondary btn-sm">&larr; 返回仪表盘</a></div>`;

    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
        console.error(e);
    }
}

render();
