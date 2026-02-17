/**
 * Portfolio Page JavaScript
 * Handles portfolio data display, charts, and interactions
 */

let currentGoalId = null;
let portfolioValueChart = null;
let stockAllocationChart = null;

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
    const unrealizedPnl = currentValue - totalInvested;
    const returnPct = totalInvested > 0 ? ((unrealizedPnl / totalInvested) * 100) : 0;

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
    const cagr = performance?.cagr || performance?.total_return_pct || returnPct;
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
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">No holdings yet. Add transactions to get started.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = holdings.map(h => {
        const currentValue = h.current_value || (h.quantity * (h.current_price || 0));
        const invested = h.total_invested || (h.quantity * h.avg_buy_price);
        const pnl = currentValue - invested;
        const returnPct = invested > 0 ? ((pnl / invested) * 100) : 0;
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
