// Formatting and utility functions — framework-agnostic.

const STATUS_LABELS = {
    stop_hit: '⚠ 已触发止损',
    stop_warn: '⚡ 接近止损',
    profit_hit: '🎉 已触发止盈',
    profit_warn: '👀 接近止盈',
    normal: '正常区间',
};

const ACTION_LABELS = {
    buy: '买入',
    sell: '卖出',
    watch: '关注',
    update: '更新',
};

const ACTION_CLASSES = {
    buy: 'bg-danger',
    sell: 'bg-success',
    watch: 'bg-info',
    update: 'bg-secondary',
};

const STATUS_CLASSES = {
    stop_hit: 'danger',
    stop_warn: 'warning',
    profit_hit: 'success',
    profit_warn: 'info',
    normal: 'primary',
};

export function formatPrice(p) {
    if (p == null) return '-';
    if (p === Math.floor(p)) return String(Math.floor(p));
    return p.toFixed(2);
}

export function formatPct(value) {
    if (value == null) return '-';
    const prefix = value > 0 ? '+' : '';
    return prefix + value.toFixed(2) + '%';
}

export function statusLabel(status) {
    return STATUS_LABELS[status] || '正常区间';
}

export function statusBadgeClass(status) {
    return STATUS_CLASSES[status] || 'primary';
}

export function actionLabel(action) {
    return ACTION_LABELS[action] || action;
}

export function actionBadgeClass(action) {
    return ACTION_CLASSES[action] || 'bg-secondary';
}

export function textClass(value, threshold = 0) {
    if (value > threshold) return 'text-success';
    if (value < threshold) return 'text-danger';
    return '';
}

export function bgClass(value, threshold = 0) {
    if (value >= threshold) return 'text-bg-success';
    return 'text-bg-danger';
}
