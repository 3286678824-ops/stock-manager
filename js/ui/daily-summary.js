// Daily Summary UI — auto stats per portfolio + user journal

import { getPortfolios, getStocksByPortfolio, getAllData, getDailyNote, saveDailyNote, getAllTrades } from '../api.js';
import { summaryFromStocks, alertsFromStocks, stopLossStatus, dayChangePct } from '../computations.js';
import { formatPrice, formatPct, bgClass, textClass } from '../utils.js';

const content = document.getElementById('content');
let currentDate = new Date().toISOString().split('T')[0];
let allStocks = []; // flattened stocks with portfolio name

// ── Flash ───────────────────────────────────────────────

function flash(msg, type = 'success') {
    const c = document.getElementById('flash-container');
    const el = document.createElement('div');
    el.className = `alert alert-${type} alert-dismissible fade show py-2`;
    el.innerHTML = `${msg}<button class="btn-close" data-bs-dismiss="alert"></button>`;
    c.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// ── Date helpers ────────────────────────────────────────

function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${dateStr} ${week[d.getUTCDay()]}`;
}

function prevDate(d) {
    const dt = new Date(d + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().split('T')[0];
}

function nextDate(d) {
    const dt = new Date(d + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + 1);
    const next = dt.toISOString().split('T')[0];
    if (next > currentDate) return null;
    return next;
}

// ── Alerts ──────────────────────────────────────────────

function renderAlerts(stocks) {
    const alerts = alertsFromStocks(stocks);
    if (!alerts.has_any) return '';

    let html = '<div class="mb-3">';
    for (const s of alerts.stop_hit) {
        html += `<div class="alert alert-danger d-flex align-items-center py-2 mb-1">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>止损触发！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} ≤ 止损价 ${formatPrice(s.stop_loss_price)}</div>`;
    }
    for (const s of alerts.profit_hit) {
        html += `<div class="alert alert-success d-flex align-items-center py-2 mb-1">
            <i class="bi bi-check-circle-fill me-2"></i>
            <strong>止盈触发！</strong> ${s.name}(${s.code}) 现价 ${formatPrice(s.current_price)} ≥ 止盈价 ${formatPrice(s.take_profit_price)}</div>`;
    }
    for (const s of alerts.stop_warn) {
        html += `<div class="alert alert-warning d-flex align-items-center py-2 mb-1">
            <i class="bi bi-exclamation-circle-fill me-2"></i>
            <strong>接近止损！</strong> ${s.name}(${s.code}) 距止损价不足3%</div>`;
    }
    for (const s of alerts.profit_warn) {
        html += `<div class="alert alert-info d-flex align-items-center py-2 mb-1">
            <i class="bi bi-info-circle-fill me-2"></i>
            <strong>接近止盈！</strong> ${s.name}(${s.code}) 距止盈价不足3%</div>`;
    }
    html += '</div>';
    return html;
}

// ── Portfolio cards ─────────────────────────────────────

function renderPortfolioCard(portfolio, stocks) {
    const s = summaryFromStocks(stocks);
    if (stocks.length === 0) {
        return `<div class="col-md-6 mb-3">
            <div class="card h-100">
                <div class="card-header"><strong>${portfolio.name}</strong></div>
                <div class="card-body text-center text-muted py-4">
                    <i class="bi bi-inbox" style="font-size: 2rem;"></i>
                    <p class="mt-2 mb-0">暂无持仓</p>
                </div>
            </div>
        </div>`;
    }

    // Top gainers & losers (holding stocks only)
    const holdingOnly = stocks.filter(s => s.status === 'holding');
    const sorted = [...holdingOnly].sort((a, b) => {
        const da = dayChangePct(a.current_price, a.prev_close_price);
        const db = dayChangePct(b.current_price, b.prev_close_price);
        return db - da;
    });
    const topGainers = sorted.slice(0, 3).filter(x => dayChangePct(x.current_price, x.prev_close_price) > 0);
    const topLosers = sorted.slice(-3).reverse().filter(x => dayChangePct(x.current_price, x.prev_close_price) < 0);

    return `<div class="col-md-6 mb-3">
        <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
                <strong>${portfolio.name}</strong>
                <small class="text-muted">${stocks.length}只</small>
            </div>
            <div class="card-body">
                <div class="row g-2 mb-2">
                    <div class="col-4"><small class="text-muted">市值</small><div class="fw-bold">${formatPrice(s.total_mv)}</div></div>
                    <div class="col-4"><small class="text-muted">成本</small><div class="fw-bold">${formatPrice(s.total_cost)}</div></div>
                    <div class="col-4"><small class="text-muted">盈亏</small>
                        <div class="fw-bold ${textClass(s.total_pl)}">${formatPrice(s.total_pl)}<br><small>${formatPct(s.total_pl_pct)}</small></div>
                    </div>
                </div>
                <div class="mb-2">
                    <small class="text-muted">今日涨跌</small>
                    <span class="fw-bold ${textClass(s.total_day_change)}">${formatPrice(s.total_day_change)}</span>
                </div>
                ${topGainers.length > 0 ? `
                <div class="mb-1"><small class="text-success">领涨:</small>
                    ${topGainers.map(x => `<span class="badge bg-success-subtle text-success">${x.name} ${formatPct(dayChangePct(x.current_price, x.prev_close_price))}</span>`).join(' ')}
                </div>` : ''}
                ${topLosers.length > 0 ? `
                <div><small class="text-danger">领跌:</small>
                    ${topLosers.map(x => `<span class="badge bg-danger-subtle text-danger">${x.name} ${formatPct(dayChangePct(x.current_price, x.prev_close_price))}</span>`).join(' ')}
                </div>` : ''}
            </div>
        </div>
    </div>`;
}

// ── Main render ─────────────────────────────────────────

async function render(date) {
    content.innerHTML = '加载中<span class="spin ms-2"></span>';

    try {
        const { portfolios, stocks: allStocksData } = await getAllData();
        if (portfolios.length === 0) {
            content.innerHTML = `<div class="text-center text-muted py-5">
                <p>暂无分组，请先创建</p><a href="portfolios" class="btn btn-primary">去创建分组</a></div>`;
            return;
        }

        // Group stocks by portfolio
        const stocksByPortfolio = {};
        for (const s of allStocksData) {
            if (!stocksByPortfolio[s.portfolio_id]) stocksByPortfolio[s.portfolio_id] = [];
            stocksByPortfolio[s.portfolio_id].push(s);
        }

        const portfolioStocks = portfolios.map(p => ({
            portfolio: p,
            stocks: stocksByPortfolio[p.id] || [],
        }));
        allStocks = allStocksData.map(s => {
            const p = portfolios.find(pf => pf.id === s.portfolio_id);
            return { ...s, portfolio_name: p ? p.name : '' };
        });

        // Fetch daily note
        const noteRecord = await getDailyNote(date);
        const noteContent = noteRecord ? noteRecord.content : '';

        // Fetch today's trades
        let todayTrades = [];
        try {
            const allTrades = await getAllTrades(1, 200);
            const dateStart = date + 'T00:00:00';
            const dateEnd = date + 'T23:59:59';
            todayTrades = allTrades.logs.filter(t => t.created_at >= dateStart && t.created_at <= dateEnd);
        } catch { /* ignore */ }

        const hasNext = nextDate(date) !== null;
        const prev = prevDate(date);
        const next = nextDate(date);

        let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <a href="#" class="btn btn-outline-secondary btn-sm" data-date="${prev}"><i class="bi bi-chevron-left"></i> 前一天</a>
            <h5 class="mb-0">${fmtDate(date)}</h5>
            ${hasNext ? `<a href="#" class="btn btn-outline-secondary btn-sm" data-date="${next}">后一天 <i class="bi bi-chevron-right"></i></a>` : '<span></span>'}
        </div>
        <div class="text-center mb-3">
            <input type="date" class="form-control form-control-sm d-inline-block" style="max-width:200px" id="date-picker" value="${date}">
        </div>`;

        // Alerts
        const allHolding = allStocks.filter(s => s.status === 'holding' || s.status === 'watching');
        html += renderAlerts(allHolding);

        // Portfolio cards
        html += '<div class="row">';
        for (const { portfolio, stocks } of portfolioStocks) {
            const activeStocks = stocks.filter(s => s.status === 'holding' || s.status === 'watching');
            html += renderPortfolioCard(portfolio, activeStocks);
        }
        html += '</div>';

        // Overall summary
        const allActive = allHolding;
        const overall = summaryFromStocks(allActive);
        html += `
        <div class="card mt-3">
            <div class="card-header"><strong><i class="bi bi-pie-chart"></i> 全部持仓汇总</strong></div>
            <div class="card-body">
                <div class="row text-center">
                    <div class="col-3"><small class="text-muted">持仓数</small><div class="fs-5 fw-bold">${overall.count}只</div></div>
                    <div class="col-3"><small class="text-muted">总市值</small><div class="fs-5 fw-bold">${formatPrice(overall.total_mv)}</div></div>
                    <div class="col-3"><small class="text-muted">总盈亏</small><div class="fs-5 fw-bold ${textClass(overall.total_pl)}">${formatPrice(overall.total_pl)}<br><small>${formatPct(overall.total_pl_pct)}</small></div></div>
                    <div class="col-3"><small class="text-muted">今日涨跌</small><div class="fs-5 fw-bold ${textClass(overall.total_day_change)}">${formatPrice(overall.total_day_change)}</div></div>
                </div>
            </div>
        </div>`;

        // Today's trades card
        let tradesCardHtml = '';
        const actionLabel = { buy: '买入', sell: '卖出', watch: '关注', update: '修改' };
        if (todayTrades.length > 0) {
            const items = todayTrades.map(t => {
                const s = allStocks.find(x => x.id === t.stock_id);
                const stockName = s ? `${s.name}(${s.code})` : `#${t.stock_id}`;
                const label = actionLabel[t.action] || t.action;
                const insertText = `${label} ${stockName} ${t.quantity > 0 ? t.quantity + '股' : ''} ${t.price > 0 ? '@' + formatPrice(t.price) : ''}`.trim();
                return `<div class="d-flex justify-content-between align-items-center py-1 px-2 border-bottom">
                    <span class="small">
                        <span class="badge bg-secondary me-1">${label}</span>
                        ${stockName}
                        ${t.quantity > 0 ? `<span class="text-muted">${t.quantity}股</span>` : ''}
                        ${t.price > 0 ? `<span class="text-muted">@${formatPrice(t.price)}</span>` : ''}
                    </span>
                    <button class="btn btn-sm btn-outline-primary insert-trade-btn" data-text="\\n## ${escapeHtml(insertText)}\\n" title="点击加入今日总结">
                        <i class="bi bi-plus-lg"></i> 加入总结
                    </button>
                </div>`;
            }).join('');
            tradesCardHtml = `
            <div class="card mt-3">
                <div class="card-header"><strong><i class="bi bi-arrow-left-right"></i> 今日操作</strong><small class="text-muted ms-2">${todayTrades.length}笔</small></div>
                <div class="card-body py-2">
                    ${items}
                    <div class="text-muted small mt-2"><i class="bi bi-info-circle"></i> 点击"加入总结"可将操作记录插入下方日记中作为小标题</div>
                </div>
            </div>`;
        } else {
            tradesCardHtml = `
            <div class="card mt-3">
                <div class="card-header"><strong><i class="bi bi-arrow-left-right"></i> 今日操作</strong></div>
                <div class="card-body py-3 text-center text-muted">
                    <i class="bi bi-inbox" style="font-size:1.5rem;"></i>
                    <p class="mt-2 mb-0 small">今日暂无操作记录</p>
                </div>
            </div>`;
        }

        // Daily note editor
        html += `
        ${tradesCardHtml}
        <div class="card mt-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <strong><i class="bi bi-journal"></i> 交易日记</strong>
                <button class="btn btn-sm btn-primary" id="save-note-btn"><i class="bi bi-check-lg"></i> 保存</button>
            </div>
            <div class="card-body">
                <textarea class="form-control" id="daily-note" rows="10" placeholder="写下今天的复盘总结...&#10;&#10;比如：&#10;- 今天操作了什么？为什么？&#10;- 市场有什么重要消息？&#10;- 明天的计划是什么？&#10;- 有什么需要注意的风险？">${escapeHtml(noteContent)}</textarea>
                <div class="text-muted mt-2 small">
                    <span id="note-status">${noteContent ? '已有记录' : '今天还没有写总结'}</span>
                </div>
            </div>
        </div>`;

        content.innerHTML = html;
        bindEvents(date);
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
        console.error(e);
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Events ──────────────────────────────────────────────

function bindEvents(date) {
    // Date picker
    document.getElementById('date-picker')?.addEventListener('change', e => {
        render(e.target.value);
    });

    // Prev/next day
    document.querySelectorAll('[data-date]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            render(el.dataset.date);
        });
    });

    // Insert trade into journal
    document.querySelectorAll('.insert-trade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const textarea = document.getElementById('daily-note');
            const insertText = btn.dataset.text.replace(/\\n/g, '\n');
            const cursor = textarea.selectionStart;
            const before = textarea.value.substring(0, cursor);
            const after = textarea.value.substring(cursor);
            const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
            textarea.value = before + prefix + insertText + '\n' + after;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = cursor + prefix.length + insertText.length + 1;
        });
    });

    // Save note
    document.getElementById('save-note-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-note-btn');
        const textarea = document.getElementById('daily-note');
        const status = document.getElementById('note-status');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 保存中...';
        try {
            await saveDailyNote(date, textarea.value);
            status.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN');
            flash('总结已保存');
        } catch (e) {
            flash('保存失败: ' + e.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i> 保存';
        }
    });
}

// ── Init ────────────────────────────────────────────────

render(currentDate);
