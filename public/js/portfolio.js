/**
 * Portfolio Page JavaScript
 * Handles portfolio data display, charts, and interactions
 */

let currentGoalId = null;
let portfolioValueChart = null;
let stockAllocationChart = null;
let currentHoldingSymbols = new Set();

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadGoals();
});

// ============================================
// Goal Loading
// ============================================
async function loadGoals() {
    try {
        const goals = await API.Goals.list();
        const select = document.getElementById('portfolioGoalSelect');

        if (goals && goals.length > 0) {
            goals.forEach(goal => {
                const option = document.createElement('option');
                option.value = goal.id;
                option.textContent = `${goal.name} (Target: ${formatCurrency(goal.target_amount)})`;
                select.appendChild(option);
            });

            // Auto-select first goal
            select.value = goals[0].id;
            loadPortfolioData();
        }
    } catch (error) {
        console.error('Failed to load goals:', error);
        showToast('Failed to load goals. Is the backend running?', 'error');
    }
}

// ============================================
// Main Data Loading
// ============================================
async function loadPortfolioData() {
    const goalId = document.getElementById('portfolioGoalSelect').value;

    if (!goalId) {
        document.getElementById('portfolioContent').style.display = 'none';
        document.getElementById('portfolioEmptyState').style.display = 'flex';
        return;
    }

    currentGoalId = parseInt(goalId);

    // Show loading, hide empty state
    document.getElementById('portfolioLoading').style.display = 'flex';
    document.getElementById('portfolioEmptyState').style.display = 'none';
    document.getElementById('portfolioContent').style.display = 'none';

    try {
        // Fetch all data in parallel
        const [portfolio, history, transactions, performance] = await Promise.all([
            API.Portfolio.get(currentGoalId),
            API.Portfolio.getHistory(currentGoalId, 30),
            API.Transactions.list(currentGoalId, 10),
            API.Portfolio.getPerformance(currentGoalId).catch(() => null)
        ]);

        // Update UI components
        updateSummaryStats(portfolio.summary, portfolio.holdings, performance);
        updateHoldingsTable(portfolio.holdings);
        updateAllocationChart(portfolio.allocation);
        updateValueChart(history);
        updateRecentTransactions(transactions);

        // Show content
        document.getElementById('portfolioContent').style.display = 'block';

        // Smart Buy recommendations (feature-level add, non-blocking)
        loadSmartBuy().catch((error) => {
            console.error('Smart Buy load failed:', error);
        });
    } catch (error) {
        console.error('Failed to load portfolio data:', error);
        showToast('Failed to load portfolio data. Please try again.', 'error');
        document.getElementById('portfolioEmptyState').style.display = 'flex';
    } finally {
        document.getElementById('portfolioLoading').style.display = 'none';
    }
}

// ============================================
// Summary Stats
// ============================================
function updateSummaryStats(summary, holdings, performance) {
    const totalInvested = summary?.total_invested || 0;
    const currentValue = summary?.total_current_value || 0;
    const unrealizedPnl = summary?.total_unrealized_pnl ?? (currentValue - totalInvested);
    const returnPct = summary?.unrealized_pnl_percentage ?? (
        totalInvested > 0 ? ((unrealizedPnl / totalInvested) * 100) : 0
    );

    // Total Invested
    document.getElementById('totalInvested').textContent = formatCurrency(totalInvested);
    document.getElementById('holdingsCount').textContent = `${holdings?.length || 0} holdings`;

    // Current Value
    document.getElementById('currentValue').textContent = formatCurrency(currentValue);
    document.getElementById('lastUpdated').textContent = `Updated just now`;

    // Unrealized P/L
    const pnlEl = document.getElementById('unrealizedPnl');
    pnlEl.textContent = `${unrealizedPnl >= 0 ? '+' : ''}${formatCurrency(unrealizedPnl)}`;
    pnlEl.className = `stat-value ${unrealizedPnl >= 0 ? 'text-success' : 'text-danger'}`;

    const returnEl = document.getElementById('overallReturn');
    returnEl.textContent = `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
    returnEl.className = `stat-change ${returnPct >= 0 ? 'positive' : 'negative'}`;

    // CAGR / Overall Return
    const cagr = performance?.cagr || performance?.total_return_pct || summary?.total_pnl_percentage || returnPct;
    const cagrEl = document.getElementById('cagrValue');
    cagrEl.textContent = `${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)}%`;
    cagrEl.className = `stat-value ${cagr >= 0 ? 'text-success' : 'text-danger'}`;

    document.getElementById('cagrLabel').textContent = performance?.cagr != null ? 'CAGR' : 'Total Return';

    // Holdings badge
    document.getElementById('holdingsBadge').textContent = `${holdings?.length || 0} stocks`;
}

// ============================================
// Holdings Table
// ============================================
function updateHoldingsTable(holdings) {
    const tbody = document.querySelector('#holdingsTable tbody');

    if (!holdings || holdings.length === 0) {
        currentHoldingSymbols = new Set();
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">No holdings yet. Add transactions to get started.</td>
            </tr>
        `;
        return;
    }

    currentHoldingSymbols = new Set(
        holdings
            .map((h) => normalizeStockSymbol(h.symbol || h.stock_symbol))
            .filter(Boolean)
    );

    tbody.innerHTML = holdings.map(h => {
        const currentValue = h.current_value || (h.quantity * (h.current_price || 0));
        const invested = h.total_invested || (h.quantity * h.avg_buy_price);
        const pnl = (h.unrealized_pnl !== undefined && h.unrealized_pnl !== null)
            ? h.unrealized_pnl
            : (currentValue - invested);
        const returnPct = (h.unrealized_pnl_pct !== undefined && h.unrealized_pnl_pct !== null)
            ? h.unrealized_pnl_pct
            : (invested > 0 ? ((pnl / invested) * 100) : 0);
        const isPositive = pnl >= 0;

        return `
            <tr>
                <td>
                    <span class="symbol-badge">${h.symbol || h.stock_symbol}</span>
                    <span class="symbol-name">${h.name || h.stock_name || ''}</span>
                </td>
                <td>${h.quantity}</td>
                <td>${formatCurrency(h.avg_buy_price)}</td>
                <td>${formatCurrency(h.current_price || 0)}</td>
                <td>${formatCurrency(currentValue)}</td>
                <td class="${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '+' : ''}${formatCurrency(pnl)}
                </td>
                <td class="${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '+' : ''}${returnPct.toFixed(2)}%
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// Portfolio Value Chart
// ============================================
function updateValueChart(history) {
    const ctx = document.getElementById('portfolioValueChart').getContext('2d');

    if (portfolioValueChart) {
        portfolioValueChart.destroy();
    }

    if (!history || history.length === 0) {
        portfolioValueChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['No data'], datasets: [{ data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const labels = history.map(h => {
        const d = new Date(h.date);
        return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    });
    const values = history.map(h => h.value);

    // Determine gradient color based on trend
    const firstVal = values[0] || 0;
    const lastVal = values[values.length - 1] || 0;
    const isPositive = lastVal >= firstVal;

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    if (isPositive) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)');
    } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.01)');
    }

    portfolioValueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Value',
                data: values,
                borderColor: isPositive ? '#10b981' : '#ef4444',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: isPositive ? '#10b981' : '#ef4444',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 26, 0.95)',
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    titleFont: { family: 'Inter' },
                    bodyFont: { family: 'Inter' },
                    callbacks: {
                        label: function (ctx) {
                            return `Value: ${formatCurrency(ctx.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, maxTicksLimit: 8 }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Inter', size: 11 },
                        callback: function (value) {
                            if (value >= 10000000) return '₹' + (value / 10000000).toFixed(1) + 'Cr';
                            if (value >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
                            if (value >= 1000) return '₹' + (value / 1000).toFixed(1) + 'K';
                            return '₹' + value;
                        }
                    }
                }
            }
        }
    });
}

async function changeHistoryRange(days, btn) {
    if (!currentGoalId) return;

    // Update active button
    document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    try {
        const history = await API.Portfolio.getHistory(currentGoalId, days);
        updateValueChart(history);
    } catch (error) {
        console.error('Failed to load history:', error);
        showToast('Failed to load history data.', 'error');
    }
}

// ============================================
// Allocation Chart
// ============================================
function updateAllocationChart(allocation) {
    const ctx = document.getElementById('stockAllocationChart').getContext('2d');

    if (stockAllocationChart) {
        stockAllocationChart.destroy();
    }

    if (!allocation || allocation.length === 0) {
        stockAllocationChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No holdings'],
                datasets: [{ data: [1], backgroundColor: ['rgba(100,116,139,0.3)'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const colors = [
        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
        '#ef4444', '#ec4899', '#3b82f6', '#14b8a6', '#f97316',
        '#a855f7', '#22d3ee', '#84cc16', '#fb923c', '#e879f9'
    ];

    stockAllocationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: allocation.map(a => a.symbol || a.stock_symbol),
            datasets: [{
                data: allocation.map(a => a.weight || a.percentage || 0),
                backgroundColor: colors.slice(0, allocation.length),
                borderColor: 'rgba(15, 15, 26, 0.8)',
                borderWidth: 3,
                hoverBorderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 26, 0.95)',
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    borderWidth: 1,
                    titleFont: { family: 'Inter' },
                    bodyFont: { family: 'Inter' },
                    callbacks: {
                        label: function (ctx) {
                            const value = ctx.parsed;
                            return ` ${ctx.label}: ${value.toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// Recent Transactions
// ============================================
function updateRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactionsList');

    if (!transactions || transactions.length === 0) {
        container.innerHTML = `
            <div class="transaction-item empty-state">
                <span class="rec-icon">📋</span>
                <span class="rec-text">No recent transactions. Add your first transaction to get started.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = transactions.map(t => {
        const isBuy = t.type?.toUpperCase() === 'BUY';
        const dateStr = new Date(t.date).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        return `
            <div class="transaction-item">
                <div class="transaction-date">${dateStr}</div>
                <span class="type-badge ${isBuy ? 'buy' : 'sell'}">${t.type}</span>
                <div class="transaction-stock">
                    <span class="symbol-badge">${t.symbol}</span>
                </div>
                <div class="transaction-details">
                    <span>${t.quantity} shares @ ${formatCurrency(t.price)}</span>
                </div>
                <div class="transaction-total">
                    ${formatCurrency(t.total_value || (t.quantity * t.price))}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Refresh
// ============================================
function refreshPortfolio() {
    if (currentGoalId) {
        loadPortfolioData();
        showToast('Portfolio data refreshed!', 'success');
    } else {
        showToast('Please select a goal first.', 'info');
    }
}

// ============================================
// Smart Buy Recommendations
// ============================================
function ensureSmartBuySection() {
    const content = document.getElementById('portfolioContent');
    if (!content) return null;

    let section = document.getElementById('smartBuySection');
    if (section) return section;

    section = document.createElement('section');
    section.id = 'smartBuySection';
    section.className = 'data-section smart-buy-section';
    section.style.gridTemplateColumns = '1fr';
    section.innerHTML = `
        <div class="data-card">
            <div class="card-header">
                <div class="smart-buy-header-title">
                    <span class="smart-buy-icon">🎯</span>
                    <h3>Smart Buy Recommendations</h3>
                    <span class="badge badge-info smart-buy-ai-badge">AI Powered</span>
                </div>
                <button id="refreshSmartBuyBtn" class="btn btn-secondary btn-sm" type="button">Refresh</button>
            </div>
            <p class="smart-buy-subtitle">
                Stocks with meaningful short-term dips that still fit your goal, risk profile, and growth requirement.
            </p>
            <div id="smartBuyLoading" class="portfolio-loading" style="display:none;min-height:120px;">
                <div class="loading-spinner"></div>
                <span>Analyzing market dips and goal fit...</span>
            </div>
            <div id="smartBuyList" class="smart-buy-grid"></div>
        </div>
    `;

    const recentTxSection = document.getElementById('recentTransactionsList')?.closest('section');
    if (recentTxSection && recentTxSection.parentNode) {
        recentTxSection.parentNode.insertBefore(section, recentTxSection);
    } else {
        content.appendChild(section);
    }

    const refreshBtn = section.querySelector('#refreshSmartBuyBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadSmartBuy().catch((error) => {
                console.error('Smart Buy refresh failed:', error);
            });
        });
    }

    return section;
}

async function loadSmartBuy() {
    if (!currentGoalId) return;

    ensureSmartBuySection();
    const listEl = document.getElementById('smartBuyList');
    const loadingEl = document.getElementById('smartBuyLoading');
    const refreshBtn = document.getElementById('refreshSmartBuyBtn');

    if (!listEl || !loadingEl || !API.Recommendations.getSmartBuy) return;

    loadingEl.style.display = 'flex';
    listEl.innerHTML = '';
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
    }

    try {
        const recs = await API.Recommendations.getSmartBuy(currentGoalId);
        renderSmartBuyRecommendations(recs);
    } catch (err) {
        console.error('Smart Buy fetch failed:', err);
        listEl.innerHTML = `
            <div class="smart-buy-empty">
                <span class="smart-buy-empty-icon">📡</span>
                <p>Unable to fetch Smart Buy recommendations right now.</p>
            </div>`;
    } finally {
        loadingEl.style.display = 'none';
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
        }
    }
}

function renderSmartBuyRecommendations(recs) {
    const listEl = document.getElementById('smartBuyList');
    if (!listEl) return;

    const filteredRecs = (Array.isArray(recs) ? recs : []).filter((r) => {
        const symbol = normalizeStockSymbol(r?.symbol);
        return !r?.already_held && !currentHoldingSymbols.has(symbol);
    });

    if (filteredRecs.length === 0) {
        listEl.innerHTML = `
            <div class="smart-buy-empty">
                <span class="smart-buy-empty-icon">✅</span>
                <p>No new Smart Buy opportunities right now. Existing picks are already in your portfolio or market dips are limited.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = filteredRecs.map((r) => {
        const conviction = (r.conviction || 'WATCH').toUpperCase();
        const convClass = conviction === 'STRONG'
            ? 'conviction-strong'
            : conviction === 'MODERATE'
                ? 'conviction-moderate'
                : 'conviction-watch';
        const dipValue = Number(r.dip_pct || 0);
        const dipClass = dipValue <= -10 ? 'dip-deep' : 'dip-mild';
        const score = Math.max(0, Math.min(Number(r.goal_fit_score || 0), 100));
        const scoreLabel = escapeHtml(r.goal_fit_label || (score >= 75 ? 'High Fit' : score >= 55 ? 'Moderate Fit' : 'Low Fit'));
        const reasons = buildSmartBuyReasonList(r.reason);
        const symbol = escapeHtml(normalizeStockSymbol(r.symbol));
        const name = escapeHtml(r.name || r.symbol || 'Unknown');
        const sector = escapeHtml(r.sector || 'Unknown');
        const price = formatCurrency(r.current_price || 0);

        return `
            <article class="smart-buy-card ${convClass}">
                <div class="smart-buy-card-top">
                    <div class="smart-buy-symbol-block">
                        <span class="smart-buy-symbol">${symbol}</span>
                        <span class="smart-buy-name">${name}</span>
                    </div>
                    <span class="conviction-pill ${convClass}">${escapeHtml(conviction)}</span>
                </div>
                <div class="smart-buy-metrics">
                    <div class="smart-buy-metric">
                        <span class="metric-label">Current Price</span>
                        <span class="metric-value">${price}</span>
                    </div>
                    <div class="smart-buy-metric">
                        <span class="metric-label">5-Day Dip</span>
                        <span class="metric-value ${dipClass}">${dipValue.toFixed(1)}%</span>
                    </div>
                    <div class="smart-buy-metric">
                        <span class="metric-label">Sector</span>
                        <span class="metric-value metric-sector">${sector}</span>
                    </div>
                </div>
                <div class="smart-buy-fit">
                    <div class="fit-bar-header">
                        <span class="fit-bar-label">Goal Fit Score</span>
                        <span class="fit-bar-score">${score}/100 - ${scoreLabel}</span>
                    </div>
                    <div class="fit-bar">
                        <div class="fit-bar-fill ${convClass}" style="width:${score}%;"></div>
                    </div>
                </div>
                <div class="smart-buy-reason">
                    <ul class="smart-buy-reason-list">${reasons}</ul>
                </div>
            </article>
        `;
    }).join('');
}

function normalizeStockSymbol(symbol) {
    return String(symbol || '')
        .toUpperCase()
        .replace('.NS', '')
        .replace('.BO', '')
        .trim();
}

function buildSmartBuyReasonList(reason) {
    const parts = String(reason || '')
        .split('·')
        .map((text) => text.trim())
        .filter(Boolean)
        .slice(0, 3);

    if (parts.length === 0) {
        return '<li>Market dip and goal-fit conditions are favorable.</li>';
    }

    return parts.map((text) => `<li>${escapeHtml(text)}</li>`).join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

if (!document.getElementById('smartBuyFeatureStyles')) {
    const smartBuyStyle = document.createElement('style');
    smartBuyStyle.id = 'smartBuyFeatureStyles';
    smartBuyStyle.textContent = `
    .smart-buy-section .card-header {
        align-items: flex-start;
        gap: var(--spacing-md);
        flex-wrap: wrap;
    }

    .smart-buy-header-title {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        flex-wrap: wrap;
    }

    .smart-buy-icon {
        font-size: var(--font-size-lg);
    }

    .smart-buy-ai-badge {
        background: rgba(99, 102, 241, 0.16);
        border: 1px solid rgba(99, 102, 241, 0.35);
        color: var(--color-primary-light);
    }

    .smart-buy-subtitle {
        color: var(--text-muted);
        font-size: var(--font-size-sm);
        margin: -6px 0 var(--spacing-lg);
        line-height: 1.45;
    }

    .smart-buy-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--spacing-md);
    }

    .smart-buy-card {
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-lg);
        background: var(--glass-bg);
        padding: var(--spacing-md);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        position: relative;
        overflow: hidden;
    }

    .smart-buy-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 3px;
    }

    .smart-buy-card.conviction-strong::before {
        background: var(--gradient-green);
    }

    .smart-buy-card.conviction-moderate::before {
        background: var(--gradient-orange);
    }

    .smart-buy-card.conviction-watch::before {
        background: linear-gradient(180deg, #64748b, #94a3b8);
    }

    .smart-buy-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--spacing-sm);
    }

    .smart-buy-symbol-block {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .smart-buy-symbol {
        font-size: var(--font-size-lg);
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: 0.3px;
    }

    .smart-buy-name {
        font-size: var(--font-size-xs);
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 170px;
    }

    .conviction-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }

    .conviction-pill.conviction-strong {
        background: rgba(16, 185, 129, 0.18);
        color: var(--color-accent-green);
    }

    .conviction-pill.conviction-moderate {
        background: rgba(245, 158, 11, 0.18);
        color: var(--color-accent-orange);
    }

    .conviction-pill.conviction-watch {
        background: rgba(100, 116, 139, 0.2);
        color: var(--text-secondary);
    }

    .smart-buy-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--spacing-sm);
    }

    .smart-buy-metric {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .metric-label {
        font-size: 10px;
        color: var(--text-muted);
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }

    .metric-value {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--text-primary);
    }

    .metric-value.dip-deep {
        color: var(--color-accent-red);
    }

    .metric-value.dip-mild {
        color: var(--color-accent-orange);
    }

    .metric-value.metric-sector {
        color: var(--color-primary-light);
        font-size: var(--font-size-xs);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .smart-buy-fit {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

    .fit-bar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--spacing-sm);
    }

    .fit-bar-label {
        font-size: 10px;
        color: var(--text-muted);
        letter-spacing: 0.4px;
        text-transform: uppercase;
    }

    .fit-bar-score {
        font-size: var(--font-size-xs);
        color: var(--text-secondary);
        font-weight: 600;
    }

    .fit-bar {
        height: 7px;
        border-radius: var(--radius-full);
        overflow: hidden;
        background: rgba(148, 163, 184, 0.18);
    }

    .fit-bar-fill {
        height: 100%;
        border-radius: var(--radius-full);
        transition: width 0.45s ease;
    }

    .fit-bar-fill.conviction-strong {
        background: var(--gradient-green);
    }

    .fit-bar-fill.conviction-moderate {
        background: var(--gradient-orange);
    }

    .fit-bar-fill.conviction-watch {
        background: linear-gradient(90deg, #64748b, #94a3b8);
    }

    .smart-buy-reason {
        border-top: 1px solid var(--glass-border);
        padding-top: var(--spacing-sm);
    }

    .smart-buy-reason-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--text-secondary);
        font-size: var(--font-size-xs);
        line-height: 1.45;
    }

    .smart-buy-reason-list li::before {
        content: '•';
        color: var(--text-muted);
        margin-right: 6px;
    }

    .smart-buy-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: var(--spacing-sm);
        min-height: 120px;
        color: var(--text-muted);
        grid-column: 1 / -1;
    }

    .smart-buy-empty-icon {
        font-size: 24px;
    }

    @media (max-width: 920px) {
        .smart-buy-metrics {
            grid-template-columns: 1fr;
        }
    }
`;
    document.head.appendChild(smartBuyStyle);
}
