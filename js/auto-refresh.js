// Auto-refresh timer — pure logic, no DOM dependencies.
// Manages a periodic refresh loop that respects page visibility.

export class AutoRefresh {
    /**
     * @param {() => Promise<any>} refreshFn - the async refresh function to call
     * @param {Object} [opts]
     * @param {number} [opts.intervalMs=60000] - interval in milliseconds
     * @param {boolean} [opts.onlyWhenVisible=true] - skip refresh when tab is hidden
     * @param {(status: 'running'|'refreshing'|'stopped') => void} [opts.onStatus] - status callback for UI
     * @param {(error: Error) => void} [opts.onError] - error callback
     */
    constructor(refreshFn, opts = {}) {
        this._refreshFn = refreshFn;
        this._intervalMs = opts.intervalMs ?? 60_000;
        this._onlyWhenVisible = opts.onlyWhenVisible ?? true;
        this._onStatus = opts.onStatus || (() => {});
        this._onError = opts.onError || (() => {});
        this._timerId = null;
        this._running = false;
    }

    get isRunning() {
        return this._running;
    }

    get intervalMs() {
        return this._intervalMs;
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._onStatus('running');
        this._schedule();
    }

    stop() {
        this._running = false;
        if (this._timerId) {
            clearTimeout(this._timerId);
            this._timerId = null;
        }
        this._onStatus('stopped');
    }

    /** Change interval at runtime (takes effect on next tick). */
    setInterval(ms) {
        this._intervalMs = ms;
    }

    _schedule() {
        if (!this._running) return;
        this._timerId = setTimeout(async () => {
            if (this._onlyWhenVisible && document.visibilityState !== 'visible') {
                // Tab hidden — skip this tick, check again next cycle
                this._schedule();
                return;
            }
            this._onStatus('refreshing');
            try {
                await this._refreshFn();
            } catch (e) {
                this._onError(e);
            }
            this._onStatus('running');
            this._schedule();
        }, this._intervalMs);
    }
}
