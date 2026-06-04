// Trade recording form

import { getStockById, createTradeLog, updateStock } from '../api.js';
import { formatPrice } from '../utils.js';

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

        content.innerHTML = `
        <div class="card mb-3" style="max-width:500px;">
            <div class="card-body">
                <h5><span class="badge bg-light text-dark">${stock.code}</span> ${stock.name}</h5>
                <div class="text-muted small">
                    成本价 ${formatPrice(stock.cost_price)} | 现价 ${formatPrice(stock.current_price)} | 持仓 ${stock.quantity} 股
                </div>
            </div>
        </div>
        <form id="trade-form" class="row g-3" style="max-width:500px;">
            <div class="col-12">
                <label class="form-label">操作类型 <span class="text-danger">*</span></label>
                <div class="btn-group w-100" role="group" id="action-group">
                    <input type="radio" class="btn-check" name="action" value="buy" id="act-buy" autocomplete="off" checked>
                    <label class="btn btn-outline-danger" for="act-buy"><i class="bi bi-cart-plus"></i> 买入</label>
                    <input type="radio" class="btn-check" name="action" value="sell" id="act-sell" autocomplete="off">
                    <label class="btn btn-outline-success" for="act-sell"><i class="bi bi-cart-dash"></i> 卖出</label>
                    <input type="radio" class="btn-check" name="action" value="watch" id="act-watch" autocomplete="off">
                    <label class="btn btn-outline-info" for="act-watch"><i class="bi bi-eye"></i> 关注</label>
                </div>
            </div>
            <div class="col-sm-6 col-12">
                <label class="form-label">价格 <span class="text-danger">*</span></label>
                <input type="number" step="0.01" class="form-control" name="price" value="${stock.current_price}" required>
            </div>
            <div class="col-sm-6 col-12" id="qty-field">
                <label class="form-label">数量（股） <span class="text-danger">*</span></label>
                <input type="number" step="1" class="form-control" name="quantity" value="100" required min="1">
            </div>
            <div class="col-12">
                <label class="form-label">备注</label>
                <input type="text" class="form-control" name="note" placeholder="可选">
            </div>
            <div class="col-12">
                <button type="submit" class="btn btn-primary">记录操作</button>
                <a href="stock-detail.html?id=${stock.id}" class="btn btn-secondary ms-2">取消</a>
            </div>
        </form>`;

        // Hide quantity for "watch" action
        const qtyField = document.getElementById('qty-field');
        document.querySelectorAll('[name="action"]').forEach(radio => {
            radio.addEventListener('change', () => {
                qtyField.style.display = radio.value === 'watch' ? 'none' : '';
            });
        });

        document.getElementById('trade-form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const action = fd.get('action');
            const price = parseFloat(fd.get('price')) || 0;
            const quantity = action === 'watch' ? 0 : (parseInt(fd.get('quantity')) || 0);
            const note = fd.get('note').trim();

            if (action !== 'watch' && quantity <= 0) {
                flash('数量必须大于0', 'danger');
                return;
            }

            try {
                // Create trade log
                await createTradeLog({ stockId: stock.id, action, price, quantity, note });

                // Update stock
                if (action === 'buy') {
                    const totalCost = stock.cost_price * stock.quantity + price * quantity;
                    const newQty = stock.quantity + quantity;
                    await updateStock(stock.id, {
                        costPrice: Math.round(totalCost / newQty * 1000) / 1000,
                        quantity: newQty,
                        currentPrice: price,
                    });
                } else if (action === 'sell') {
                    if (quantity > stock.quantity) {
                        flash('卖出数量不能超过持有数量', 'danger');
                        return;
                    }
                    const newQty = stock.quantity - quantity;
                    const updates = { quantity: newQty, currentPrice: price };
                    if (newQty === 0) {
                        updates.status = 'sold';
                        updates.costPrice = 0;
                    }
                    await updateStock(stock.id, updates);
                } else if (action === 'watch') {
                    await updateStock(stock.id, { status: 'watching' });
                }

                flash(`操作已记录: ${stock.name}`);
                setTimeout(() => { location.href = `stock-detail.html?id=${stock.id}`; }, 500);
            } catch (err) {
                flash('操作失败: ' + err.message, 'danger');
            }
        });

    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

render();
