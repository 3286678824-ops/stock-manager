// Trade log list

import { getAllTrades } from '../api.js';
import { formatPrice } from '../utils.js';
import { actionLabel, actionBadgeClass } from '../utils.js';

const content = document.getElementById('content');

async function render(page = 1) {
    content.innerHTML = '加载中<span class="spin ms-2"></span>';

    try {
        const { logs, total, perPage } = await getAllTrades(page, 30);
        const totalPages = Math.ceil(total / perPage);

        if (logs.length === 0) {
            content.innerHTML = '<div class="text-center text-muted py-5"><p>暂无操作记录</p></div>';
            return;
        }

        const rows = logs.map(t => `
            <tr>
                <td class="text-nowrap">${new Date(t.created_at).toLocaleString('zh-CN', {hour12: false})}</td>
                <td><span class="badge ${actionBadgeClass(t.action)}">${actionLabel(t.action)}</span></td>
                <td class="text-end">${formatPrice(t.price)}</td>
                <td class="text-end">${t.quantity}</td>
                <td class="text-muted small">${t.note || ''}</td>
            </tr>
        `).join('');

        let paginationHtml = '';
        if (totalPages > 1) {
            let pages = '';
            for (let i = 1; i <= totalPages; i++) {
                pages += `<li class="page-item ${i === page ? 'active' : ''}">
                    <a class="page-link" href="?page=${i}" data-page="${i}">${i}</a></li>`;
            }
            paginationHtml = `
            <nav><ul class="pagination pagination-sm justify-content-center mt-3">
                <li class="page-item ${page <= 1 ? 'disabled' : ''}"><a class="page-link" href="?page=${page-1}" data-page="${page-1}">&laquo;</a></li>
                ${pages}
                <li class="page-item ${page >= totalPages ? 'disabled' : ''}"><a class="page-link" href="?page=${page+1}" data-page="${page+1}">&raquo;</a></li>
            </ul></nav>`;
        }

        content.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-hover">
                <thead class="table-light"><tr><th>时间</th><th>操作</th><th class="text-end">价格</th><th class="text-end">数量</th><th>备注</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${paginationHtml}
        <small class="text-muted">共 ${total} 条记录</small>`;

        // Pagination click handlers
        document.querySelectorAll('[data-page]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                const p = parseInt(el.dataset.page);
                history.pushState(null, '', '?page=' + p);
                render(p);
            });
        });

    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

const params = new URLSearchParams(location.search);
const page = parseInt(params.get('page')) || 1;
render(page);
