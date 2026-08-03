// Dashboard UI — renders portfolio tabs, summary cards, alerts, stock table

import { getPortfolios, getStocksByPortfolio, getAllData, refreshStockPrices, saveSnapshots, exportCsv, cleanupSoldStocks } from '../api.js';
import { alertsFromStocks, summaryFromStocks, stopLossStatus, rowClass, statusColor } from '../computations.js';
import { formatPrice, formatPct, actionLabel, actionBadgeClass, textClass, bgClass, statusLabel, statusBadgeClass } from '../utils.js';

const content = document.getElementById('content');
let activePid = null;
let allPortfolios = [];
let currentStocks = [];

// ── Flash messages ────────────────────────────────────

function flash(msg, type = 'success') {
    const c = document.getElementById('flash-container');
    const el = document.createElement('div');
    el.className = `alert alert-${type} alert-dismissible fade show py-2`;
    el.innerHTML = `${msg}<button class="btn-close" data-bs-dismiss="alert"></button>`;
    c.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// ── Render helpers ────────────────────────────────────

function renderAlerts(stocks) {
    const alerts = alertsFromStocks(stocks);
    if (!alerts.has_any) return '';

    let html = '<div class="mb-3">';
    for (const s of alerts.stop_hit) {
        html += `<div class="alert alert-danger d-flex align-items-center py-2 mb-1">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>止损触发！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} ≤ 止损价 ${formatPrice(s.stop_loss_price)}
            &nbsp;<a href="stock-detail?id=${s.id}" class="alert-link">查看详情</a></div>`;
    }
    for (const s of alerts.profit_hit) {
        html += `<div class="alert alert-success d-flex align-items-center py-2 mb-1">
            <i class="bi bi-check-circle-fill me-2"></i>
            <strong>止盈触发！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} ≥ 止盈价 ${formatPrice(s.take_profit_price)}
            &nbsp;<a href="stock-detail?id=${s.id}" class="alert-link">查看详情</a></div>`;
    }
    for (const s of alerts.stop_warn) {
        html += `<div class="alert alert-warning d-flex align-items-center py-2 mb-1">
            <i class="bi bi-exclamation-circle-fill me-2"></i>
            <strong>接近止损！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} 距止损价 ${formatPrice(s.stop_loss_price)} 不足3%</div>`;
    }
    for (const s of alerts.profit_warn) {
        html += `<div class="alert alert-info d-flex align-items-center py-2 mb-1">
            <i class="bi bi-info-circle-fill me-2"></i>
            <strong>接近止盈！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} 距止盈价 ${formatPrice(s.take_profit_price)} 不足3%</div>`;
    }
    html += '</div>';
    return html;
}

function renderSummaryCards(summary) {
    const today = new Date().toISOString().split('T')[0];
    return `
    <div class="row g-3 mb-4">
        <div class="col-md-2 col-6">
            <div class="card text-bg-primary"><div class="card-body text-center">
                <small class="text-white-50">持仓数量</small>
                <div class="fs-4 fw-bold">${summary.count}</div><small class="text-white-50">只</small>
            </div></div>
        </div>
        <div class="col-md-2 col-6">
            <div class="card text-bg-secondary"><div class="card-body text-center">
                <small class="text-white-50">总成本</small>
                <div class="fs-4 fw-bold">${formatPrice(summary.total_cost)}</div>
            </div></div>
        </div>
        <div class="col-md-2 col-6">
            <div class="card text-bg-secondary"><div class="card-body text-center">
                <small class="text-white-50">总市值</small>
                <div class="fs-4 fw-bold">${formatPrice(summary.total_mv)}</div>
            </div></div>
        </div>
        <div class="col-md-2 col-6">
            <div class="card ${bgClass(summary.total_pl)}"><div class="card-body text-center">
                <small class="text-white-50">总盈亏</small>
                <div class="fs-4 fw-bold">${formatPrice(summary.total_pl)}</div>
                <small class="text-white-50">${formatPrice(summary.total_pl_pct)}%</small>
            </div></div>
        </div>
        <div class="col-md-2 col-6">
            <div class="card ${bgClass(summary.total_day_change)}"><div class="card-body text-center">
                <small class="text-white-50">今日盈亏</small>
                <div class="fs-4 fw-bold">${formatPrice(summary.total_day_change)}</div>
            </div></div>
        </div>
        <div class="col-md-2 col-6">
            <div class="card text-bg-light"><div class="card-body text-center">
                <small class="text-muted">今日日期</small>
                <div class="fs-5 fw-bold text-dark">${today}</div>
            </div></div>
        </div>
    </div>`;
}

function renderStockTable(stocks) {
    const activeStocks = stocks.filter(s => s.status !== 'sold');
    const soldStocks = stocks.filter(s => s.status === 'sold');

    if (activeStocks.length === 0 && soldStocks.length === 0) {
        return `<tr><td colspan="13" class="text-center text-muted py-5">
            <i class="bi bi-inbox" style="font-size: 2rem;"></i>
            <p class="mt-2">暂无持仓数据</p>
            <a href="stock-form?pid=${activePid}" class="btn btn-primary btn-sm">添加第一只股票</a>
        </td></tr>`;
    }

    function stockRow(s) {
        const status = stopLossStatus(s.current_price, s.stop_loss_price, s.take_profit_price, s.status);
        const cls = rowClass(status, s.status);
        const stopCell = s.stop_loss_price
            ? `<span class="${status === 'stop_hit' || status === 'stop_warn' ? 'text-danger fw-bold' : 'text-muted'}">${formatPrice(s.stop_loss_price)}</span>`
            : '<span class="text-muted">-</span>';
        const profitCell = s.take_profit_price
            ? `<span class="${status === 'profit_hit' || status === 'profit_warn' ? 'text-success fw-bold' : 'text-muted'}">${formatPrice(s.take_profit_price)}</span>`
            : '<span class="text-muted">-</span>';

        const mv = Math.round(s.current_price * s.quantity * 100) / 100;
        const cv = Math.round(s.cost_price * s.quantity * 100) / 100;
        const pl = Math.round((mv - cv) * 100) / 100;
        const plPct = s.cost_price > 0 ? Math.round((s.current_price - s.cost_price) / s.cost_price * 10000) / 100 : 0;
        const dcPct = s.prev_close_price > 0 ? Math.round((s.current_price - s.prev_close_price) / s.prev_close_price * 10000) / 100 : 0;

        const isSold = s.status === 'sold';
        const muted = isSold ? ' text-muted' : '';

        return `<tr class="${cls}">
            <td><span class="badge bg-light ${isSold ? 'text-muted' : 'text-dark'}">${s.code}</span></td>
            <td>
                <a href="stock-detail?id=${s.id}" class="text-decoration-none fw-bold${muted}">${s.name}</a>
                ${s.status === 'watching' ? '<span class="badge bg-info">关注</span>' : ''}
                ${isSold ? '<span class="badge bg-secondary">已卖出</span>' : ''}
            </td>
            <td class="text-end${muted}">${isSold ? '-' : formatPrice(s.cost_price)}</td>
            <td class="text-end${muted}${isSold ? '' : ' ' + textClass(s.current_price, s.prev_close_price) + ' fw-bold'}">${formatPrice(s.current_price)}</td>
            <td class="text-end text-muted d-none d-md-table-cell">${formatPrice(s.prev_close_price)}</td>
            <td class="text-end${muted}${isSold ? '' : ' ' + textClass(dcPct) + ' fw-bold'}">${formatPct(dcPct)}</td>
            <td class="text-end${muted}">${isSold ? '0' : s.quantity}</td>
            <td class="text-end${muted}">${isSold ? '-' : formatPrice(mv)}</td>
            <td class="text-end${muted}${isSold ? '' : ' ' + textClass(pl) + ' fw-bold'}">${isSold ? '-' : formatPrice(pl)}</td>
            <td class="text-end${muted}${isSold ? '' : ' ' + textClass(plPct)}">${isSold ? '-' : formatPrice(plPct) + '%'}</td>
            <td class="text-end${muted}">${isSold ? '-' : stopCell}</td>
            <td class="text-end${muted}">${isSold ? '-' : profitCell}</td>
            <td class="text-center text-nowrap">
                ${isSold ? '' : `<a href="trade-form?id=${s.id}" class="btn btn-sm btn-outline-success" title="记录操作"><i class="bi bi-pencil-square"></i></a>`}
                <a href="stock-form?id=${s.id}" class="btn btn-sm ${isSold ? 'btn-outline-secondary' : 'btn-outline-warning'}" title="编辑"><i class="bi bi-gear"></i></a>
                <button class="btn btn-sm btn-outline-danger" title="删除" data-delete="${s.id}" data-name="${s.name}"><i class="bi bi-trash"></i></button>
            </td>
        </tr>`;
    }

    let html = activeStocks.map(s => stockRow(s)).join('');

    if (soldStocks.length > 0) {
        html += `<tr class="table-sold-divider">
            <td colspan="13">
                <span class="text-muted small">
                    <i class="bi bi-archive"></i> 已清仓股票 (${soldStocks.length}只)
                </span>
            </td>
        </tr>`;
        html += soldStocks.map(s => stockRow(s)).join('');
    }

    return html;
}

function renderTabs(portfolios, active) {
    return portfolios.map(p => `
        <li class="nav-item">
            <a class="nav-link ${p.id === active.id ? 'active' : ''}" href="?pid=${p.id}" data-pid="${p.id}">
                ${p.name} <span class="badge bg-secondary ms-1">${p.stock_count || 0}</span>
            </a>
        </li>
    `).join('');
}

// ── Main render ───────────────────────────────────────

async function render(pid) {
    content.innerHTML = '加载中<span class="spin ms-2"></span>';

    const renderWithData = (portfolios, stocks) => {
        allPortfolios = portfolios;

        const stocksByPortfolio = {};
        for (const s of stocks) {
            if (!stocksByPortfolio[s.portfolio_id]) stocksByPortfolio[s.portfolio_id] = [];
            stocksByPortfolio[s.portfolio_id].push(s);
        }
        for (const p of allPortfolios) {
            p.stock_count = (stocksByPortfolio[p.id] || []).length;
        }

        if (allPortfolios.length === 0) {
            content.innerHTML = `<div class="text-center text-muted py-5">
                <i class="bi bi-folder2-open" style="font-size: 3rem;"></i>
                <p class="mt-2">暂无分组，请先创建</p>
                <a href="portfolios" class="btn btn-primary">去创建分组</a>
            </div>`;
            return;
        }

        const active = (pid && allPortfolios.find(p => p.id === pid)) || allPortfolios[0];
        activePid = active.id;
        currentStocks = stocksByPortfolio[active.id] || [];
        const summary = summaryFromStocks(currentStocks);

        content.innerHTML = `
            ${allPortfolios.length > 1 ? `<ul class="nav nav-tabs mb-3">${renderTabs(allPortfolios, active)}</ul>` : ''}
            <h5 class="mb-3"><i class="bi bi-speedometer2"></i> ${active.name}
                <small class="text-muted fs-6">${active.description || ''}</small></h5>
            ${renderAlerts(currentStocks)}
            ${renderSummaryCards(summary)}
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <strong><i class="bi bi-table"></i> 持仓列表</strong>
                    <div class="d-flex flex-wrap gap-1 justify-content-end">
                        <button class="btn btn-sm btn-outline-secondary" id="snapshot-btn"><i class="bi bi-camera"></i> 快照</button>
                        <button class="btn btn-sm btn-outline-primary" id="refresh-table-btn"><i class="bi bi-arrow-clockwise"></i> 刷新</button>
                        <a href="stock-form?pid=${active.id}" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg"></i> 添加</a>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th style="width:80px">代码</th><th>名称</th>
                                <th class="text-end">成本价</th><th class="text-end">现价</th><th class="text-end d-none d-md-table-cell">昨收</th>
                                <th class="text-end">涨跌</th><th class="text-end">数量</th><th class="text-end">市值</th>
                                <th class="text-end">盈亏</th><th class="text-end">收益率</th>
                                <th class="text-end " style="width:70px">止损价</th><th class="text-end" style="width:70px">止盈价</th>
                                <th class="text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody>${renderStockTable(currentStocks)}</tbody>
                    </table>
                </div>
            </div>`;

        bindEvents();
    };

    try {
        content.innerHTML = '加载中<span class="spin ms-2"></span>';

        const data = await getAllData({
            withCache: true,
            onFresh: (fresh) => renderWithData(fresh.portfolios, fresh.stocks),
        });
        renderWithData(data.portfolios, data.stocks);
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
        console.error(e);
    }
}

// ── Event handlers ────────────────────────────────────

function bindEvents() {
    // Tab clicks
    document.querySelectorAll('[data-pid]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            const pid = parseInt(el.dataset.pid);
            history.pushState(null, '', '?pid=' + pid);
            render(pid);
        });
    });

    // Refresh button — updates prices then re-renders with full fresh data
    const doRefresh = async () => {
        const result = await refreshStockPrices();
        flash(`行情刷新完成，更新了 ${result.updated} 只股票`);
        // Clear cache so render() fetches fresh data (including stop-loss etc.)
        localStorage.removeItem('stock_manager_cache');
        await render(activePid);
    };

    const refreshBtn = document.getElementById('refresh-table-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 刷新中...';
            try {
                await doRefresh();
            } catch (e) {
                flash('刷新失败: ' + e.message, 'danger');
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新行情';
            }
        });
    }

    // Navbar refresh
    document.getElementById('refresh-btn')?.addEventListener('click', async e => {
        e.preventDefault();
        const navbarBtn = document.getElementById('refresh-btn');
        navbarBtn.innerHTML = '<span class="spin me-1"></span>刷新中...';
        try {
            await doRefresh();
        } catch (e) {
            flash('刷新失败: ' + e.message, 'danger');
        }
        navbarBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新行情';
    });

    // Snapshot button
    document.getElementById('snapshot-btn')?.addEventListener('click', async () => {
        try {
            const result = await saveSnapshots();
            flash(`已保存 ${result.saved} 只股票的今日快照`);
        } catch (e) {
            flash('保存快照失败: ' + e.message, 'danger');
        }
    });

    // Export button
    document.getElementById('export-btn')?.addEventListener('click', async e => {
        e.preventDefault();
        try {
            await exportCsv();
            flash('导出成功');
        } catch (e) {
            flash('导出失败: ' + e.message, 'danger');
        }
    });

    // Delete buttons
    document.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.name;
            const id = btn.dataset.id;
            if (!confirm(`确定要删除 ${name} 吗？此操作不可恢复。`)) return;
            try {
                const { deleteStock } = await import('../api.js');
                await deleteStock(id);
                flash(`已删除 ${name}`);
                await render(activePid);
            } catch (e) {
                flash('删除失败: ' + e.message, 'danger');
            }
        });
    });
}

// ── Init ──────────────────────────────────────────────

// One-time cleanup: rename sold stocks to avoid code conflicts
cleanupSoldStocks().then(count => {
    if (count > 0) console.log(`Cleaned up ${count} sold stock codes`);
}).catch(e => console.warn('Sold stock cleanup:', e.message));

const params = new URLSearchParams(location.search);
const pid = params.get('pid') ? parseInt(params.get('pid')) : null;
render(pid);
