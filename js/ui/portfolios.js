// Portfolio management page

import { getPortfolios, getStocksByPortfolio, createPortfolio, updatePortfolio, deletePortfolio } from '../api.js';

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
    try {
        const portfolios = await getPortfolios();
        // Get stock counts
        for (const p of portfolios) {
            const stocks = await getStocksByPortfolio(p.id);
            p.stock_count = stocks.length;
        }

        let listHtml = '';
        if (portfolios.length === 0) {
            listHtml = '<div class="text-center text-muted py-3">暂无分组</div>';
        } else {
            listHtml = portfolios.map(p => `
            <div class="card mb-2">
                <div class="card-body d-flex justify-content-between align-items-center py-2">
                    <div>
                        <strong>${p.name}</strong>
                        <span class="badge bg-secondary ms-2">${p.stock_count} 只</span>
                        <small class="text-muted ms-2">${p.description || ''}</small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-warning me-1" data-edit="${p.id}" data-name="${p.name}" data-desc="${p.description || ''}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" data-delete="${p.id}" data-name="${p.name}" data-count="${p.stock_count}"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>`).join('');
        }

        content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-header"><strong>新建分组</strong></div>
                    <div class="card-body">
                        <form id="create-form">
                            <div class="mb-2">
                                <input type="text" class="form-control" name="name" placeholder="分组名称" required>
                            </div>
                            <div class="mb-2">
                                <input type="text" class="form-control" name="description" placeholder="描述（可选）">
                            </div>
                            <button type="submit" class="btn btn-primary btn-sm">创建</button>
                        </form>
                    </div>
                </div>
                <h6>现有分组</h6>
                ${listHtml}
            </div>
        </div>

        <!-- Edit modal -->
        <div class="modal fade" id="editModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header"><h5 class="modal-title">编辑分组</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id">
                            <div class="mb-2"><label class="form-label">名称</label><input type="text" class="form-control" name="name" required></div>
                            <div class="mb-2"><label class="form-label">描述</label><input type="text" class="form-control" name="description"></div>
                            <button type="submit" class="btn btn-primary">保存</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;

        bindEvents(portfolios);
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function bindEvents(portfolios) {
    const editModal = new bootstrap.Modal(document.getElementById('editModal'));
    const editForm = document.getElementById('edit-form');

    // Create
    document.getElementById('create-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = fd.get('name').trim();
        if (!name) { flash('请输入分组名称', 'danger'); return; }
        try {
            await createPortfolio(name, fd.get('description').trim());
            flash(`分组 "${name}" 已创建`);
            render();
        } catch (err) {
            flash('创建失败: ' + err.message, 'danger');
        }
    });

    // Edit buttons
    document.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            editForm.id.value = btn.dataset.edit;
            editForm.name.value = btn.dataset.name;
            editForm.description.value = btn.dataset.desc;
            editModal.show();
        });
    });

    // Edit submit
    editForm.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await updatePortfolio(parseInt(fd.get('id')), fd.get('name').trim(), fd.get('description').trim());
            flash('分组已更新');
            editModal.hide();
            render();
        } catch (err) {
            flash('更新失败: ' + err.message, 'danger');
        }
    });

    // Delete buttons
    document.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.name;
            const count = parseInt(btn.dataset.count);
            const id = btn.dataset.id;
            if (portfolios.length <= 1) {
                flash('至少保留一个分组', 'danger');
                return;
            }
            let msg = `确定要删除分组 "${name}" 吗？`;
            if (count > 0) msg += ` 该分组下有 ${count} 只股票，删除后将一并删除。`;
            if (!confirm(msg)) return;
            try {
                await deletePortfolio(id);
                flash(`分组 "${name}" 已删除`);
                render();
            } catch (err) {
                flash('删除失败: ' + err.message, 'danger');
            }
        });
    });
}

render();
