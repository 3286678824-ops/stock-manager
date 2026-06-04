// Stock add/edit form

import { getPortfolios, getStockById, createStock, updateStock, fetchStockPrice, createTradeLog } from '../api.js';
import { detectMarket } from '../computations.js';

const content = document.getElementById('content');
const title = document.getElementById('form-title');

function flash(msg, type = 'success') {
    const c = document.getElementById('flash-container');
    const el = document.createElement('div');
    el.className = `alert alert-${type} alert-dismissible fade show py-2`;
    el.innerHTML = `${msg}<button class="btn btn-close" data-bs-dismiss="alert"></button>`;
    c.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function detectMarketLocal(code) {
    code = code.trim();
    if (/^(8|4)/.test(code) || /^92/.test(code)) return 'bj';
    if (/^(6|9)/.test(code)) return 'sh';
    return 'sz';
}

async function render() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') ? parseInt(params.get('id')) : null;
    const pid = params.get('pid') ? parseInt(params.get('pid')) : null;

    let stock = null;
    let portfolios = [];

    try {
        portfolios = await getPortfolios();
        if (id) stock = await getStockById(id);
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
        return;
    }

    if (portfolios.length === 0) {
        content.innerHTML = `<div class="alert alert-warning">请先<a href="portfolios.html">创建分组</a></div>`;
        return;
    }

    const editing = !!stock;
    title.textContent = editing ? `编辑 ${stock.name}(${stock.code})` : '添加股票';

    const selectedPid = stock ? stock.portfolio_id : (pid || portfolios[0].id);
    const portfolioOpts = portfolios.map(p =>
        `<option value="${p.id}" ${p.id === selectedPid ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const statusOpts = [
        { value: 'holding', label: '持有' },
        { value: 'watching', label: '关注' },
        { value: 'sold', label: '已卖出' },
    ].map(o => `<option value="${o.value}" ${(stock && stock.status === o.value) ? 'selected' : ''}>${o.label}</option>`).join('');

    content.innerHTML = `
    <form id="stock-form" class="row g-3" style="max-width:600px;">
        <div class="col-12">
            <label class="form-label">分组 <span class="text-danger">*</span></label>
            <select class="form-select" name="portfolio_id" required>${portfolioOpts}</select>
        </div>
        <div class="col-sm-6 col-12">
            <label class="form-label">股票代码 <span class="text-danger">*</span></label>
            <div class="input-group">
                <input type="text" class="form-control" name="code" value="${stock ? stock.code : ''}" required placeholder="如 600519" ${editing ? 'readonly' : ''}>
                ${editing ? '' : '<button class="btn btn-outline-secondary" type="button" id="lookup-btn"><i class="bi bi-search"></i> 查询</button>'}
            </div>
        </div>
        <div class="col-sm-6 col-12">
            <label class="form-label">股票名称</label>
            <input type="text" class="form-control" name="name" value="${stock ? stock.name : ''}" required placeholder="自动获取或手动输入">
        </div>
        <div class="col-sm-4 col-12">
            <label class="form-label">成本价 <span class="text-danger">*</span></label>
            <input type="number" step="0.01" class="form-control" name="cost_price" value="${stock ? stock.cost_price : ''}" required>
        </div>
        <div class="col-sm-4 col-12">
            <label class="form-label">数量（股） <span class="text-danger">*</span></label>
            <input type="number" step="1" class="form-control" name="quantity" value="${stock ? stock.quantity : '100'}" required>
        </div>
        <div class="col-sm-4 col-12">
            <label class="form-label">状态</label>
            <select class="form-select" name="status">${statusOpts}</select>
        </div>
        <div class="col-sm-6 col-12">
            <label class="form-label">止损价</label>
            <input type="number" step="0.01" class="form-control" name="stop_loss_price" value="${stock && stock.stop_loss_price ? stock.stop_loss_price : ''}" placeholder="留空则不启用">
        </div>
        <div class="col-sm-6 col-12">
            <label class="form-label">止盈价</label>
            <input type="number" step="0.01" class="form-control" name="take_profit_price" value="${stock && stock.take_profit_price ? stock.take_profit_price : ''}" placeholder="留空则不启用">
        </div>
        <div class="col-12">
            <button type="submit" class="btn btn-primary">${editing ? '保存修改' : '添加股票'}</button>
            <a href="index.html${editing ? '?pid=' + stock.portfolio_id : ''}" class="btn btn-secondary ms-2">取消</a>
        </div>
    </form>`;

    bindForm(editing, stock);
}

function bindForm(editing, stock) {
    const form = document.getElementById('stock-form');
    const lookupBtn = document.getElementById('lookup-btn');
    const codeInput = form.querySelector('[name="code"]');
    const nameInput = form.querySelector('[name="name"]');

    // Lookup stock name when code entered
    if (lookupBtn) {
        lookupBtn.addEventListener('click', async () => {
            const code = codeInput.value.trim();
            if (!code) return;
            lookupBtn.disabled = true;
            lookupBtn.innerHTML = '<span class="spin"></span>';
            try {
                const info = await fetchStockPrice(code);
                if (info.name) nameInput.value = info.name;
                if (info.current_price) {
                    // Set cost price to current price as default
                    if (!form.querySelector('[name="cost_price"]').value) {
                        form.querySelector('[name="cost_price"]').value = info.current_price;
                    }
                }
            } catch (e) {
                flash('查询失败: ' + e.message, 'danger');
            }
            lookupBtn.disabled = false;
            lookupBtn.innerHTML = '<i class="bi bi-search"></i> 查询';
        });
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = {
            portfolioId: parseInt(fd.get('portfolio_id')),
            code: fd.get('code').trim(),
            name: fd.get('name').trim(),
            market: detectMarketLocal(fd.get('code').trim()),
            costPrice: parseFloat(fd.get('cost_price')) || 0,
            quantity: parseInt(fd.get('quantity')) || 0,
            status: fd.get('status'),
            stopLossPrice: fd.get('stop_loss_price') ? parseFloat(fd.get('stop_loss_price')) : null,
            takeProfitPrice: fd.get('take_profit_price') ? parseFloat(fd.get('take_profit_price')) : null,
        };

        if (!data.code) { flash('请输入股票代码', 'danger'); return; }
        if (!data.name) { flash('请输入股票名称', 'danger'); return; }

        try {
            if (editing) {
                const oldCost = stock.cost_price;
                const oldQty = stock.quantity;
                await updateStock(stock.id, data);

                // Log if cost changed
                if (Math.abs(data.costPrice - oldCost) > 0.001) {
                    await createTradeLog({
                        stockId: stock.id, action: 'update', price: data.costPrice, quantity: 0,
                        note: `成本价 ${oldCost} → ${data.costPrice}`,
                    });
                }
                // Log if quantity changed
                if (data.quantity !== oldQty) {
                    const diff = data.quantity - oldQty;
                    await createTradeLog({
                        stockId: stock.id,
                        action: diff > 0 ? 'buy' : 'sell',
                        price: stock.current_price,
                        quantity: Math.abs(diff),
                        note: `数量 ${oldQty} → ${data.quantity}`,
                    });
                }
                flash(`${data.name} 更新成功`);
            } else {
                const newStock = await createStock(data);
                // Create initial trade log
                if (data.quantity > 0) {
                    await createTradeLog({
                        stockId: newStock.id,
                        action: data.status === 'holding' ? 'buy' : 'watch',
                        price: data.costPrice,
                        quantity: data.quantity,
                        note: '初始添加',
                    });
                }
                flash(`成功添加 ${data.name}(${data.code})`);
            }
            setTimeout(() => { location.href = `index.html?pid=${data.portfolioId}`; }, 500);
        } catch (e) {
            flash('操作失败: ' + e.message, 'danger');
        }
    });
}

render();
